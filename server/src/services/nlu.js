const { matchPlan } = require("./match");

const CONFIRM_RE =
  /^(yes|yeah|yep|yup|confirm|confirmed|book it|book this|go ahead|proceed|please book|i confirm|yes[, ]+confirm|ok[, ]+confirm)\b/i;

const OBJECTION_RE =
  /\b(too expensive|too much|too pricey|too high|too costly|cheaper|lower the price|lower price|best price|do better|can't afford|cannot afford|over budget|any discount|a discount|give me a discount|price is high|still too|still high|still expensive|can you (do|go) (lower|down)|reduce the price)\b/i;

function looksLikeConfirmation(text) {
  const value = String(text || "").trim();
  if (CONFIRM_RE.test(value)) return true;
  return /\b(yes,\s*confirm|confirm the booking|place the booking|book it now)\b/i.test(value);
}

function looksLikePriceObjection(text) {
  return OBJECTION_RE.test(String(text || ""));
}

function capacityFromMessage(text) {
  const value = String(text || "");
  const patterns = [
    /(\d+)\s*(people|persons|person|guests|pax|seats|attendees|staff)\b/i,
    /\bcapacity(?:\s+of)?\s+(\d+)\b/i,
    /\bfor\s+(\d+)\b/i,
    /\b(\d+)\s+of us\b/i,
  ];
  for (const pattern of patterns) {
    const found = value.match(pattern);
    if (found) {
      const number = Number(found[1]);
      if (number > 0) return number;
    }
  }
  return null;
}

function promoFromMessage(text) {
  const value = String(text || "");
  const labeled = value.match(/\b(?:code|promo|coupon)\s+([A-Za-z0-9]+)\b/i);
  if (labeled) return labeled[1].toUpperCase();
  const shaped = value.toUpperCase().match(/\b(?:SAVE\d+|CLOSENOW\d+|[A-Z]{2,}\d{2,})\b/);
  return shaped ? shaped[0] : null;
}

function wantsCatalog(text) {
  return /\b(available|catalog|what do you have|show me|options|what can i book)\b/i.test(text);
}

function wantsQuantityChange(text) {
  return /\b(change quantity|change the quantity|different quantity|change capacity|different capacity)\b/i.test(
    text
  );
}

/**
 * Merge a local reading of the user message with optional model fields.
 * Booking and discount decisions are not taken from the model.
 */
function interpret(message, model) {
  const text = String(message || "");
  const modelCapacity = Number(model?.requiredCapacity);
  const capacityInText = capacityFromMessage(text);
  const mentioned = promoFromMessage(text) || (model?.mentionedPromoCode ? String(model.mentionedPromoCode).toUpperCase() : null);

  let intent = "other";
  if (looksLikeConfirmation(text)) intent = "confirm";
  else if (looksLikePriceObjection(text) || model?.priceObjection === true) intent = "price_objection";
  else if (wantsQuantityChange(text)) intent = "change";
  else if (wantsCatalog(text) && !capacityInText) intent = "browse";
  else if (model?.intent && model.intent !== "other") intent = model.intent;

  return {
    intent,
    productQuery: model?.productQuery ? String(model.productQuery) : null,
    planQuery: matchPlan(text, [{ name: "Half Day" }, { name: "Full Day" }])?.name || model?.planQuery || null,
    requiredCapacity:
      capacityInText ||
      (Number.isFinite(modelCapacity) && modelCapacity > 0 && new RegExp(`\\b${modelCapacity}\\b`).test(text)
        ? Math.floor(modelCapacity)
        : null),
    mentionedPromoCode: mentioned,
    explicitConfirmation: looksLikeConfirmation(text),
    priceObjection:
      looksLikePriceObjection(text) ||
      (model?.priceObjection === true &&
        /\b(price|discount|expensive|cheaper|cost|budget|afford)\b/i.test(text) &&
        !looksLikeConfirmation(text)),
    changeQuantity: wantsQuantityChange(text),
    browse: wantsCatalog(text),
  };
}

async function extractIntent(message, history, catalog) {
  const local = interpret(message, null);
  if (!process.env.OPENAI_API_KEY) return local;

  try {
    const OpenAI = require("openai");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const names = catalog.map((product) => ({
      sku: product.sku,
      name: product.name,
      available: product.available,
      aliases: product.aliases,
    }));

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You extract slots for a sales booking system. Return JSON only.",
            "Fields: productQuery (string|null), planQuery (string|null), requiredCapacity (number|null), priceObjection (boolean), mentionedPromoCode (string|null).",
            "productQuery must be the product words the user actually used. Never replace an unavailable product with a different one.",
            "planQuery is only 'Half Day' or 'Full Day' when the user named a plan.",
            "requiredCapacity is the number of people they need space for, not a price.",
            "priceObjection is true only when they push back on price or ask for a discount.",
            "Do not choose a discount, promo, quantity, or whether a booking is allowed.",
            `Catalog: ${JSON.stringify(names)}`,
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            history: (history || []).slice(-6),
            message,
          }),
        },
      ],
    });

    const raw = JSON.parse(completion.choices[0]?.message?.content || "{}");
    return interpret(message, raw);
  } catch (error) {
    console.error("OpenAI extraction failed:", error.message);
    return local;
  }
}

module.exports = { interpret, extractIntent, looksLikeConfirmation };
