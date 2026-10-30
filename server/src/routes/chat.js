const express = require("express");
const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const { getCatalog } = require("../data/catalog");
const { extractIntent } = require("../services/nlu");
const { publicState, reduceTurn } = require("../services/engine");
const { createBooking } = require("../services/bookingService");

const router = express.Router();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function snapshot(conv) {
  return {
    stage: conv.stage || "discovery",
    priceObjectionCount: conv.priceObjectionCount || 0,
    pendingConfirmation: Boolean(conv.pendingConfirmation),
    orderFingerprint: conv.orderFingerprint || null,
    idempotencyKey: conv.idempotencyKey || null,
    bookingId: conv.bookingId || null,
    draft: conv.draft || {},
  };
}

function writeState(conv, state) {
  conv.stage = state.stage;
  conv.priceObjectionCount = state.priceObjectionCount;
  conv.pendingConfirmation = state.pendingConfirmation;
  conv.orderFingerprint = state.orderFingerprint;
  conv.idempotencyKey = state.idempotencyKey;
  conv.bookingId = state.bookingId;
  conv.draft = state.draft || {};
}

function successReply(booking) {
  const promo = booking.promoCode || "none";
  const lead = booking.duplicate
    ? `This order is already booked. Reference ${booking.id}. I reused idempotency key ${booking.idempotencyKey} and did not create a second booking.`
    : `Booking confirmed. Reference ${booking.id}.`;
  return [
    lead,
    `Product: ${booking.productName} (SKU ${booking.sku})`,
    `Plan: ${booking.planName}`,
    `Required capacity: ${booking.requiredCapacity}`,
    `Quantity: ${booking.quantity}. Math.ceil(${booking.requiredCapacity} / ${booking.maxCapacityPerUnit}) = ${booking.quantity}.`,
    `Unit price: $${Number(booking.unitPrice).toFixed(2)}`,
    `Discount: ${booking.discountPercent}%`,
    `Promo code: ${promo}`,
    `Total: $${Number(booking.total).toFixed(2)}`,
  ].join("\n");
}

async function loadConversation(conversationId) {
  if (conversationId && mongoose.Types.ObjectId.isValid(conversationId)) {
    const existing = await Conversation.findById(conversationId);
    if (existing) return existing;
  }
  return Conversation.create({});
}

async function lockConversation(id) {
  const stale = new Date(Date.now() - 30000);
  return Conversation.findOneAndUpdate(
    {
      _id: id,
      $or: [{ turnLock: { $ne: true } }, { turnLockAt: { $lt: stale } }],
    },
    { $set: { turnLock: true, turnLockAt: new Date() } },
    { new: true }
  );
}

router.post("/", async (req, res, next) => {
  try {
    const message = String(req.body?.message || "").trim();
    const clientMessageId = String(req.body?.clientMessageId || req.get("Idempotency-Key") || "").trim();
    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }
    if (!clientMessageId) {
      return res.status(400).json({ error: "clientMessageId is required." });
    }

    let conv = await loadConversation(req.body?.conversationId);
    let locked = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const current = await Conversation.findById(conv._id);
      const done = current?.turns?.find((turn) => turn.clientMessageId === clientMessageId && turn.status === "done");
      if (done?.response) return res.json(done.response);

      locked = await lockConversation(conv._id);
      if (locked) break;
      await sleep(100);
    }
    if (!locked) {
      return res.status(409).json({ error: "This conversation is busy. Retry the same message." });
    }

    conv = locked;
    try {
      const already = conv.turns.find((turn) => turn.clientMessageId === clientMessageId && turn.status === "done");
      if (already?.response) {
        conv.turnLock = false;
        await conv.save();
        return res.json(already.response);
      }

      let turn = conv.turns.find((item) => item.clientMessageId === clientMessageId);
      const stateBefore = turn?.stateBefore || snapshot(conv);
      if (!turn) {
        conv.turns.push({
          clientMessageId,
          status: "processing",
          userText: message,
          stateBefore,
        });
        await conv.save();
      }

      const catalog = getCatalog();
      const signals = await extractIntent(message, conv.messages, catalog);
      const result = reduceTurn(stateBefore, message, signals, catalog);
      const apiCalls = [];

      let booking = null;
      if (result.bookingRequest) {
        const created = await createBooking({
          ...result.bookingRequest,
          conversationId: String(conv._id),
          clientMessageId,
        });
        booking = created.booking;
        apiCalls.push({
          method: "POST",
          url: "/api/bookings",
          status: created.created ? 201 : 200,
          request: {
            ...result.bookingRequest,
            conversationId: String(conv._id),
            clientMessageId,
          },
          response: booking,
        });
        result.state.bookingId = booking.id;
        result.state.stage = "booked";
        result.state.pendingConfirmation = false;
      }

      writeState(conv, result.state);
      conv.messages.push({ role: "user", content: message });
      const reply = booking ? successReply(booking) : result.reply;
      conv.messages.push({ role: "assistant", content: reply });

      const response = {
        conversationId: String(conv._id),
        reply,
        suggestions: booking ? [] : result.suggestions,
        state: publicState(result.state),
        booking: booking || undefined,
        apiCalls,
      };

      turn = conv.turns.find((item) => item.clientMessageId === clientMessageId);
      turn.status = "done";
      turn.response = response;
      conv.turnLock = false;
      await conv.save();
      return res.json(response);
    } catch (error) {
      await Conversation.updateOne({ _id: conv._id }, { $set: { turnLock: false } });
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;
