const Booking = require("../models/Booking");
const { getCatalog } = require("../data/catalog");
const { money, quantityFor } = require("./pricing");

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function expectedPromo(discountPercent) {
  if (discountPercent === 0) return null;
  if (discountPercent === 10) return "SAVE10";
  if (discountPercent === 15) return "CLOSENOW15";
  return undefined;
}

function sameBooking(existing, body) {
  return (
    existing.sku === body.sku &&
    existing.planId === body.planId &&
    existing.requiredCapacity === body.requiredCapacity &&
    existing.quantity === body.quantity &&
    existing.discountPercent === body.discountPercent &&
    (existing.promoCode || null) === (body.promoCode || null) &&
    existing.total === body.total
  );
}

function toPublic(booking, duplicate) {
  return {
    id: String(booking._id),
    status: booking.status,
    duplicate: Boolean(duplicate),
    idempotencyKey: booking.idempotencyKey,
    conversationId: booking.conversationId,
    sku: booking.sku,
    productName: booking.productName,
    planId: booking.planId,
    planName: booking.planName,
    requiredCapacity: booking.requiredCapacity,
    maxCapacityPerUnit: booking.maxCapacityPerUnit,
    quantity: booking.quantity,
    unitPrice: booking.unitPrice,
    discountPercent: booking.discountPercent,
    promoCode: booking.promoCode,
    total: booking.total,
    currency: booking.currency,
  };
}

function validateBookingBody(body) {
  const catalog = getCatalog();
  const product = catalog.find((item) => item.sku === body.sku);
  if (!product || !product.available) {
    throw httpError(400, "That product is not available for booking.");
  }
  const plan = product.plans.find((item) => item.id === body.planId);
  if (!plan) throw httpError(400, "That plan is not on the product.");

  const requiredCapacity = Number(body.requiredCapacity);
  const quantity = Number(body.quantity);
  const expectedQuantity = quantityFor(requiredCapacity, product.max_capacity_per_unit);
  if (quantity !== expectedQuantity) {
    throw httpError(400, "Quantity does not match Math.ceil(required capacity / max capacity per unit).");
  }
  if (Number(body.unitPrice) !== plan.unit_price) {
    throw httpError(400, "Unit price does not match the catalog.");
  }
  if (![0, 10, 15].includes(Number(body.discountPercent))) {
    throw httpError(400, "Discount is above the 15% maximum or is not an allowed step.");
  }
  const promo = body.promoCode || null;
  if (promo !== expectedPromo(Number(body.discountPercent))) {
    throw httpError(400, "Promo code is not authorized for this discount.");
  }
  const expectedTotal = money(plan.unit_price * expectedQuantity * (1 - Number(body.discountPercent) / 100));
  if (money(body.total) !== expectedTotal) {
    throw httpError(400, "Total price does not match the catalog price and discount.");
  }
  if (!body.idempotencyKey) throw httpError(400, "An idempotency key is required.");

  return {
    idempotencyKey: String(body.idempotencyKey),
    conversationId: String(body.conversationId || ""),
    clientMessageId: body.clientMessageId || null,
    sku: product.sku,
    productName: product.name,
    planId: plan.id,
    planName: plan.name,
    requiredCapacity,
    maxCapacityPerUnit: product.max_capacity_per_unit,
    quantity: expectedQuantity,
    unitPrice: plan.unit_price,
    discountPercent: Number(body.discountPercent),
    promoCode: promo,
    total: expectedTotal,
    currency: "USD",
    status: "confirmed",
  };
}

async function createBooking(body) {
  const payload = validateBookingBody(body);
  const existing = await Booking.findOne({ idempotencyKey: payload.idempotencyKey });
  if (existing) {
    if (!sameBooking(existing, payload)) {
      throw httpError(409, "This idempotency key was already used for a different order.");
    }
    return { booking: toPublic(existing, true), created: false };
  }

  try {
    const created = await Booking.create(payload);
    return { booking: toPublic(created, false), created: true };
  } catch (error) {
    if (error.code === 11000) {
      const raced = await Booking.findOne({ idempotencyKey: payload.idempotencyKey });
      if (raced && sameBooking(raced, payload)) {
        return { booking: toPublic(raced, true), created: false };
      }
      throw httpError(409, "This idempotency key was already used for a different order.");
    }
    throw error;
  }
}

module.exports = { createBooking, validateBookingBody, toPublic };
