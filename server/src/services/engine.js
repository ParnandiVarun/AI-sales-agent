const crypto = require("crypto");
const { matchPlan, matchProducts } = require("./match");
const { money, priceQuote, quantityFor } = require("./pricing");

function blankState() {
  return {
    stage: "discovery",
    priceObjectionCount: 0,
    pendingConfirmation: false,
    orderFingerprint: null,
    idempotencyKey: null,
    bookingId: null,
    draft: {},
  };
}

function formatMoney(value) {
  return `$${money(value).toFixed(2)}`;
}

function fingerprintOf(draft, objectionCount) {
  if (!draft?.sku || !draft.planId || !draft.requiredCapacity || !draft.quantity) return null;
  const quote = priceQuote({
    unitPrice: draft.unitPrice,
    quantity: draft.quantity,
    objectionCount,
  });
  return [draft.sku, draft.planId, draft.requiredCapacity, draft.quantity, quote.discountPercent, quote.total].join("|");
}

function availableNames(catalog) {
  return catalog.filter((product) => product.available).map((product) => product.name);
}

function summaryText(draft, quote) {
  const promo = quote.promoCode || "none";
  return [
    "Please confirm this order before I book it.",
    `Product: ${draft.productName} (SKU ${draft.sku})`,
    `Plan: ${draft.planName}`,
    `Required capacity: ${draft.requiredCapacity}`,
    `Quantity: ${draft.quantity}. Each ${draft.productName} holds ${draft.maxCapacityPerUnit}. Math.ceil(${draft.requiredCapacity} / ${draft.maxCapacityPerUnit}) = ${draft.quantity}.`,
    `Unit price: ${formatMoney(quote.unitPrice)}`,
    `Discount: ${quote.discountPercent}%`,
    `Promo code: ${promo}`,
    `Total: ${formatMoney(quote.total)}`,
    'Reply "Yes, confirm" to book this exact order.',
  ].join("\n");
}

function applyQuote(draft, objectionCount) {
  const quote = priceQuote({
    unitPrice: draft.unitPrice,
    quantity: draft.quantity,
    objectionCount,
  });
  draft.discountPercent = quote.discountPercent;
  draft.promoCode = quote.promoCode;
  draft.subtotal = quote.subtotal;
  draft.total = quote.total;
  draft.currency = quote.currency;
  return quote;
}

function orderIsComplete(draft) {
  return Boolean(
    draft.sku &&
      draft.available &&
      draft.planId &&
      draft.requiredCapacity &&
      draft.quantity &&
      draft.unitPrice != null
  );
}

function reduceTurn(state, message, signals, catalog) {
  const next = structuredClone(state || blankState());
  next.draft = next.draft || {};
  const notes = [];
  let detailsChanged = false;

  if (next.bookingId || next.stage === "booked") {
    return {
      state: next,
      reply: `This order is already booked${next.bookingId ? ` (reference ${next.bookingId})` : ""}. I did not create another booking. Start a new chat to book something else.`,
      suggestions: ["Show me what's available"],
      bookingRequest: null,
    };
  }

  if (signals.changeQuantity) {
    if (next.draft.requiredCapacity) detailsChanged = true;
    delete next.draft.requiredCapacity;
    delete next.draft.quantity;
    next.pendingConfirmation = false;
  }

  const messageMatch = matchProducts(message, catalog);
  let resolved = messageMatch;
  if (resolved.type === "none" && signals.productQuery) {
    resolved = matchProducts(signals.productQuery, catalog);
  }

  if (resolved.type === "ambiguous") {
    const names = resolved.products.map((product) => `${product.name}${product.available ? "" : " (unavailable)"}`);
    notes.push(`I need you to pick one product. I won't guess between: ${names.join(", ")}.`);
  } else if (resolved.type === "match") {
    const product = resolved.product;
    if (next.draft.sku && next.draft.sku !== product.sku) detailsChanged = true;
    next.draft.sku = product.sku;
    next.draft.productName = product.name;
    next.draft.available = product.available;
    next.draft.maxCapacityPerUnit = product.max_capacity_per_unit;
    if (!product.available) {
      delete next.draft.planId;
      delete next.draft.planName;
      delete next.draft.unitPrice;
      delete next.draft.quantity;
      next.pendingConfirmation = false;
    }
  }

  const selected = catalog.find((product) => product.sku === next.draft.sku);
  if (selected?.available) {
    const plan = matchPlan(`${message} ${signals.planQuery || ""}`, selected.plans);
    if (plan && next.draft.planId !== plan.id) {
      if (next.draft.planId) detailsChanged = true;
      next.draft.planId = plan.id;
      next.draft.planName = plan.name;
      next.draft.unitPrice = plan.unit_price;
    }
  }

  if (signals.requiredCapacity && next.draft.available) {
    if (next.draft.requiredCapacity && next.draft.requiredCapacity !== signals.requiredCapacity) {
      detailsChanged = true;
    }
    next.draft.requiredCapacity = signals.requiredCapacity;
  }

  if (next.draft.available && next.draft.requiredCapacity && next.draft.maxCapacityPerUnit) {
    const quantity = quantityFor(next.draft.requiredCapacity, next.draft.maxCapacityPerUnit);
    if (next.draft.quantity && next.draft.quantity !== quantity) detailsChanged = true;
    next.draft.quantity = quantity;
  }

  let objectionApplied = false;
  if (signals.priceObjection && orderIsComplete(next.draft)) {
    if (next.priceObjectionCount < 2) {
      next.priceObjectionCount += 1;
      objectionApplied = true;
      detailsChanged = true;
    } else {
      notes.push("The maximum discount is 15% with promo code CLOSENOW15. I can't go lower than that.");
    }
  } else if (signals.priceObjection) {
    notes.push("I haven't quoted a price yet, so the first quote will stay at 0% until you object to that price.");
  }

  const earned = next.priceObjectionCount;
  if (signals.mentionedPromoCode) {
    const allowed = earned <= 0 ? null : earned === 1 ? "SAVE10" : "CLOSENOW15";
    if (signals.mentionedPromoCode !== allowed) {
      notes.push(
        `${signals.mentionedPromoCode} is not an authorized promo code for this order. I only apply SAVE10 after the first price objection and CLOSENOW15 after the second, and the discount never goes past 15%.`
      );
    }
  }

  if (!next.draft.sku || resolved.type === "ambiguous") {
    const list = availableNames(catalog).join(", ");
    return {
      state: { ...next, stage: "discovery", pendingConfirmation: false },
      reply: [
        ...notes,
        resolved.type === "ambiguous" ? "" : "Tell me which product you want, which plan (Half Day or Full Day), and how many people you need space for.",
        `Available now: ${list}. Town Hall is unavailable, and I won't substitute another room for it.`,
      ]
        .filter(Boolean)
        .join("\n"),
      suggestions: availableNames(catalog),
      bookingRequest: null,
    };
  }

  if (selected && !selected.available) {
    return {
      state: { ...next, stage: "discovery", pendingConfirmation: false, orderFingerprint: null },
      reply: [
        ...notes,
        `${selected.name} (SKU ${selected.sku}) is unavailable. I will not book a similar room in its place.`,
        `If you want something else, pick one of: ${availableNames(catalog).join(", ")}.`,
      ].join("\n"),
      suggestions: availableNames(catalog),
      bookingRequest: null,
    };
  }

  if (!next.draft.planId) {
    return {
      state: { ...next, stage: "discovery", pendingConfirmation: false },
      reply: [...notes, `${next.draft.productName} is available. Which plan should I quote: Half Day or Full Day?`].join("\n"),
      suggestions: ["Half Day", "Full Day"],
      bookingRequest: null,
    };
  }

  if (!next.draft.requiredCapacity) {
    return {
      state: { ...next, stage: "discovery", pendingConfirmation: false },
      reply: [
        ...notes,
        `How many people do you need the ${next.draft.productName} ${next.draft.planName} plan to cover? I'll calculate quantity as Math.ceil(required capacity / ${next.draft.maxCapacityPerUnit}).`,
      ].join("\n"),
      suggestions: [],
      bookingRequest: null,
    };
  }

  const quote = applyQuote(next.draft, next.priceObjectionCount);
  const nextFingerprint = fingerprintOf(next.draft, next.priceObjectionCount);
  if (next.orderFingerprint && next.orderFingerprint !== nextFingerprint) detailsChanged = true;

  if (!next.idempotencyKey || detailsChanged || next.orderFingerprint !== nextFingerprint) {
    if (detailsChanged || next.orderFingerprint !== nextFingerprint) {
      next.idempotencyKey = crypto.randomUUID();
      next.pendingConfirmation = false;
    }
  }
  next.orderFingerprint = nextFingerprint;

  const canBook =
    signals.explicitConfirmation &&
    state?.pendingConfirmation === true &&
    !detailsChanged &&
    !objectionApplied &&
    orderIsComplete(next.draft);

  if (canBook) {
    next.stage = "confirming";
    return {
      state: next,
      reply: summaryText(next.draft, quote),
      suggestions: [],
      bookingRequest: {
        idempotencyKey: next.idempotencyKey,
        sku: next.draft.sku,
        productName: next.draft.productName,
        planId: next.draft.planId,
        planName: next.draft.planName,
        requiredCapacity: next.draft.requiredCapacity,
        maxCapacityPerUnit: next.draft.maxCapacityPerUnit,
        quantity: next.draft.quantity,
        unitPrice: next.draft.unitPrice,
        discountPercent: quote.discountPercent,
        promoCode: quote.promoCode,
        total: quote.total,
        currency: quote.currency,
      },
    };
  }

  next.stage = "confirming";
  next.pendingConfirmation = true;

  const lead = [];
  if (objectionApplied && quote.discountPercent === 10) {
    lead.push("You objected to the price, so I applied SAVE10 for 10% off. That is the first and only concession so far.");
  } else if (objectionApplied && quote.discountPercent === 15) {
    lead.push("You objected to the price again, so I applied CLOSENOW15 for 15% off. That is the maximum.");
  } else if (!signals.priceObjection && quote.discountPercent === 0) {
    lead.push("Here is the full-price quote. Discount is 0% and the promo code is empty until you object to the price.");
  }
  if (detailsChanged && state?.pendingConfirmation) {
    lead.push("The order changed, so the previous confirmation is no longer valid. This is a new total and it needs a fresh yes.");
  }

  return {
    state: next,
    reply: [...notes, ...lead, summaryText(next.draft, quote)].filter(Boolean).join("\n"),
    suggestions: ["Yes, confirm", "Change quantity"],
    bookingRequest: null,
  };
}

function publicState(state) {
  const draft = state.draft || {};
  return {
    stage: state.bookingId ? "booked" : state.stage,
    product: draft.productName || null,
    sku: draft.sku || null,
    plan: draft.planName || null,
    planId: draft.planId || null,
    requiredCapacity: draft.requiredCapacity || null,
    maxCapacityPerUnit: draft.maxCapacityPerUnit || null,
    quantity: draft.quantity || null,
    unitPrice: draft.unitPrice ?? null,
    discountCode: draft.promoCode ?? null,
    discountPercent: draft.discountPercent ?? 0,
    subtotal: draft.subtotal ?? null,
    total: draft.total ?? null,
    currency: draft.currency || "USD",
    idempotencyKey: state.idempotencyKey || null,
    pendingConfirmation: Boolean(state.pendingConfirmation),
    calculation:
      draft.requiredCapacity && draft.maxCapacityPerUnit
        ? `Math.ceil(${draft.requiredCapacity} / ${draft.maxCapacityPerUnit}) = ${draft.quantity}`
        : null,
  };
}

module.exports = { blankState, reduceTurn, publicState, summaryText };
