function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) grid[i][0] = i;
  for (let j = 0; j < cols; j += 1) grid[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      grid[i][j] = Math.min(grid[i - 1][j] + 1, grid[i][j - 1] + 1, grid[i - 1][j - 1] + cost);
    }
  }
  return grid[a.length][b.length];
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

function includesPhrase(haystack, needle) {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(haystack);
}

function scoreProduct(query, product) {
  const q = normalize(query);
  if (!q) return 0;
  const labels = [product.name, product.sku, ...(product.aliases || [])].map(normalize);
  let best = 0;

  for (const label of labels) {
    if (!label) continue;
    if (q === label || includesPhrase(q, label)) {
      best = Math.max(best, 1);
      continue;
    }

    const qTokens = q.split(" ");
    const labelTokens = label.split(" ");
    for (let i = 0; i < qTokens.length; i += 1) {
      const window = qTokens.slice(i, i + labelTokens.length).join(" ");
      if (window) best = Math.max(best, similarity(window, label));
    }
    if (labelTokens.length === 1 && label.length >= 4) {
      for (const token of qTokens) {
        if (token.length < 4) continue;
        best = Math.max(best, similarity(token, label));
      }
    }
  }

  return best;
}

function matchProducts(query, catalog) {
  const q = normalize(query);
  if (!q) return { type: "none", products: [] };

  const scored = catalog
    .map((product) => ({ product, score: scoreProduct(q, product) }))
    .sort((a, b) => b.score - a.score);

  const strong = scored.filter((row) => row.score >= 0.98);
  if (strong.length === 1) return { type: "match", product: strong[0].product };
  if (strong.length > 1) return { type: "ambiguous", products: strong.map((row) => row.product) };

  const fuzzy = scored.filter((row) => row.score >= 0.84);
  if (fuzzy.length === 1) return { type: "match", product: fuzzy[0].product };
  if (fuzzy.length > 1) {
    const top = fuzzy[0].score;
    const close = fuzzy.filter((row) => top - row.score <= 0.05);
    if (close.length > 1) return { type: "ambiguous", products: close.map((row) => row.product) };
    return { type: "match", product: fuzzy[0].product };
  }

  if (/\b(room|space|venue)\b/.test(q)) {
    return { type: "ambiguous", products: catalog.filter((product) => product.available) };
  }

  return { type: "none", products: [] };
}

function matchPlan(text, plans) {
  const value = normalize(text);
  if (!value) return null;
  if (/\bhalf day\b|\bmorning\b|\bafternoon\b/.test(value)) {
    return plans.find((plan) => /half/i.test(plan.name)) || null;
  }
  if (/\bfull day\b|\ball day\b|\bwhole day\b|\bentire day\b/.test(value)) {
    return plans.find((plan) => /full/i.test(plan.name)) || null;
  }
  return null;
}

module.exports = { matchProducts, matchPlan, normalize };
