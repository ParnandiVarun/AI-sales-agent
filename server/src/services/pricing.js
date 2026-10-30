const MAX_DISCOUNT = 15;

function money(value) {
  return Math.round(Number(value) * 100) / 100;
}

function quantityFor(requiredCapacity, maxCapacityPerUnit) {
  const required = Number(requiredCapacity);
  const max = Number(maxCapacityPerUnit);
  if (!Number.isFinite(required) || !Number.isFinite(max) || required <= 0 || max <= 0) {
    return null;
  }
  return Math.ceil(required / max);
}

function discountForObjectionCount(count) {
  const objections = Math.max(0, Math.min(2, Number(count) || 0));
  if (objections <= 0) return { discountPercent: 0, promoCode: null };
  if (objections === 1) return { discountPercent: 10, promoCode: "SAVE10" };
  return { discountPercent: MAX_DISCOUNT, promoCode: "CLOSENOW15" };
}

function priceQuote({ unitPrice, quantity, objectionCount }) {
  const discount = discountForObjectionCount(objectionCount);
  const subtotal = money(unitPrice * quantity);
  const total = money(subtotal * (1 - discount.discountPercent / 100));
  return {
    unitPrice: money(unitPrice),
    quantity,
    subtotal,
    discountPercent: discount.discountPercent,
    promoCode: discount.promoCode,
    total,
    currency: "USD",
  };
}

function promoIsAuthorized(code, objectionCount) {
  if (!code) return true;
  const earned = discountForObjectionCount(objectionCount).promoCode;
  return code === earned;
}

module.exports = {
  MAX_DISCOUNT,
  money,
  quantityFor,
  discountForObjectionCount,
  priceQuote,
  promoIsAuthorized,
};
