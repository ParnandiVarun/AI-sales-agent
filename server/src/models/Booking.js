const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    idempotencyKey: { type: String, required: true, unique: true },
    conversationId: { type: String, required: true },
    clientMessageId: { type: String, default: null },
    sku: { type: String, required: true },
    productName: { type: String, required: true },
    planId: { type: String, required: true },
    planName: { type: String, required: true },
    requiredCapacity: { type: Number, required: true },
    maxCapacityPerUnit: { type: Number, required: true },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    discountPercent: { type: Number, required: true },
    promoCode: { type: String, default: null },
    total: { type: Number, required: true },
    currency: { type: String, default: "USD" },
    status: { type: String, default: "confirmed" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Booking", bookingSchema);
