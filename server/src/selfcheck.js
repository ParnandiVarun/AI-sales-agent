const assert = require("assert");
const { getCatalog } = require("./data/catalog");
const { blankState, reduceTurn } = require("./services/engine");
const { interpret } = require("./services/nlu");
const { quantityFor } = require("./services/pricing");

const catalog = getCatalog();

function turn(state, message) {
  const signals = interpret(message, null);
  return reduceTurn(state, message, signals, catalog);
}

function quote() {
  const result = turn(blankState(), "I need a bordroom for 30 people for a full day");
  assert.strictEqual(result.bookingRequest, null);
  assert.strictEqual(result.state.draft.sku, "BOARD-12");
  assert.strictEqual(result.state.draft.productName, "Boardroom");
  assert.strictEqual(result.state.draft.planName, "Full Day");
  assert.strictEqual(result.state.draft.requiredCapacity, 30);
  assert.strictEqual(result.state.draft.quantity, 3);
  assert.strictEqual(result.state.draft.discountPercent, 0);
  assert.strictEqual(result.state.draft.promoCode, null);
  assert.strictEqual(result.state.draft.total, 1200);
  assert.strictEqual(result.state.pendingConfirmation, true);
  assert.ok(result.reply.includes("Math.ceil(30 / 12) = 3"));
  return result.state;
}

function main() {
  assert.strictEqual(quantityFor(30, 12), 3);
  assert.strictEqual(quantityFor(24, 12), 2);
  assert.strictEqual(quantityFor(13, 12), 2);
  assert.strictEqual(quantityFor(5, 4), 2);

  const quoted = quote();

  const unavailable = turn(blankState(), "Book the town hall for 50 people full day");
  assert.strictEqual(unavailable.state.draft.sku, "HALL-80");
  assert.strictEqual(unavailable.bookingRequest, null);
  assert.notStrictEqual(unavailable.state.draft.sku, "BOARD-12");
  assert.ok(/unavailable/i.test(unavailable.reply));
  assert.ok(!/total:/i.test(unavailable.reply));

  const ambiguous = turn(blankState(), "I need a room for 10 people");
  assert.strictEqual(ambiguous.bookingRequest, null);
  assert.ok(/pick one product/i.test(ambiguous.reply));

  const pod = turn(blankState(), "conferance pod for 5 people half day");
  assert.strictEqual(pod.state.draft.sku, "POD-4");
  assert.strictEqual(pod.state.draft.quantity, 2);
  assert.strictEqual(pod.state.draft.planName, "Half Day");
  assert.strictEqual(pod.state.draft.total, 180);

  const firstCut = turn(quoted, "That price is too expensive");
  assert.strictEqual(firstCut.state.priceObjectionCount, 1);
  assert.strictEqual(firstCut.state.draft.promoCode, "SAVE10");
  assert.strictEqual(firstCut.state.draft.discountPercent, 10);
  assert.strictEqual(firstCut.state.draft.total, 1080);
  assert.strictEqual(firstCut.bookingRequest, null);
  assert.notStrictEqual(firstCut.state.idempotencyKey, quoted.idempotencyKey);

  const secondCut = turn(firstCut.state, "It is still too high");
  assert.strictEqual(secondCut.state.draft.promoCode, "CLOSENOW15");
  assert.strictEqual(secondCut.state.draft.discountPercent, 15);
  assert.strictEqual(secondCut.state.draft.total, 1020);

  const ceiling = turn(secondCut.state, "Can you do better, this is still too expensive");
  assert.strictEqual(ceiling.state.draft.discountPercent, 15);
  assert.strictEqual(ceiling.state.draft.promoCode, "CLOSENOW15");
  assert.ok(/maximum/i.test(ceiling.reply));

  const rejected = turn(quoted, "Apply promo code SAVE50");
  assert.strictEqual(rejected.state.draft.discountPercent, 0);
  assert.strictEqual(rejected.state.draft.promoCode, null);
  assert.ok(/not an authorized/i.test(rejected.reply));

  const skipAhead = turn(quoted, "Please use promo CLOSENOW15");
  assert.strictEqual(skipAhead.state.draft.discountPercent, 0);
  assert.strictEqual(skipAhead.state.draft.promoCode, null);

  const earlyYes = turn(blankState(), "Yes, confirm");
  assert.strictEqual(earlyYes.bookingRequest, null);

  const booked = turn(quoted, "Yes, confirm");
  assert.ok(booked.bookingRequest);
  assert.strictEqual(booked.bookingRequest.quantity, 3);
  assert.strictEqual(booked.bookingRequest.promoCode, null);
  assert.strictEqual(booked.bookingRequest.discountPercent, 0);
  assert.strictEqual(booked.bookingRequest.total, 1200);
  assert.strictEqual(booked.bookingRequest.idempotencyKey, quoted.idempotencyKey);

  const changed = turn(quoted, "Yes, confirm, but make it 40 people");
  assert.strictEqual(changed.bookingRequest, null);
  assert.strictEqual(changed.state.draft.requiredCapacity, 40);
  assert.strictEqual(changed.state.draft.quantity, 4);
  assert.strictEqual(changed.state.draft.total, 1600);
  assert.ok(/fresh yes/i.test(changed.reply));
  assert.notStrictEqual(changed.state.idempotencyKey, quoted.idempotencyKey);

  const afterChange = turn(changed.state, "Yes, confirm");
  assert.ok(afterChange.bookingRequest);
  assert.strictEqual(afterChange.bookingRequest.quantity, 4);
  assert.strictEqual(afterChange.bookingRequest.idempotencyKey, changed.state.idempotencyKey);

  console.log("selfcheck passed");
}

main();
