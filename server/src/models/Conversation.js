const mongoose = require("mongoose");

const turnSchema = new mongoose.Schema(
  {
    clientMessageId: { type: String, required: true },
    status: { type: String, enum: ["processing", "done"], default: "processing" },
    userText: String,
    stateBefore: mongoose.Schema.Types.Mixed,
    response: mongoose.Schema.Types.Mixed,
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    stage: { type: String, default: "discovery" },
    priceObjectionCount: { type: Number, default: 0 },
    pendingConfirmation: { type: Boolean, default: false },
    orderFingerprint: { type: String, default: null },
    idempotencyKey: { type: String, default: null },
    bookingId: { type: String, default: null },
    bookingLock: { type: Boolean, default: false },
    bookingLockAt: { type: Date, default: null },
    turnLock: { type: Boolean, default: false },
    turnLockAt: { type: Date, default: null },
    draft: { type: mongoose.Schema.Types.Mixed, default: {} },
    turns: { type: [turnSchema], default: [] },
    messages: {
      type: [{ role: String, content: String }],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Conversation", conversationSchema);
