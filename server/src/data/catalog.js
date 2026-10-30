/**
 * Sellable rooms. max_capacity_per_unit lives on the product.
 * Town Hall is intentionally unavailable so it must never be swapped
 * for a similar room that is in stock.
 */
const catalog = [
  {
    sku: "POD-4",
    name: "Conference Pod",
    available: true,
    max_capacity_per_unit: 4,
    aliases: ["pod", "conf pod", "conference pod", "huddle pod"],
    plans: [
      { id: "half-day", name: "Half Day", unit_price: 90 },
      { id: "full-day", name: "Full Day", unit_price: 150 },
    ],
  },
  {
    sku: "BOARD-12",
    name: "Boardroom",
    available: true,
    max_capacity_per_unit: 12,
    aliases: ["boardroom", "board room", "board", "executive room"],
    plans: [
      { id: "half-day", name: "Half Day", unit_price: 240 },
      { id: "full-day", name: "Full Day", unit_price: 400 },
    ],
  },
  {
    sku: "TRAIN-20",
    name: "Training Room",
    available: true,
    max_capacity_per_unit: 20,
    aliases: ["training room", "classroom", "workshop room"],
    plans: [
      { id: "half-day", name: "Half Day", unit_price: 180 },
      { id: "full-day", name: "Full Day", unit_price: 300 },
    ],
  },
  {
    sku: "HALL-80",
    name: "Town Hall",
    available: false,
    max_capacity_per_unit: 80,
    aliases: ["town hall", "townhall", "auditorium", "main hall"],
    plans: [
      { id: "half-day", name: "Half Day", unit_price: 900 },
      { id: "full-day", name: "Full Day", unit_price: 1500 },
    ],
  },
  {
    sku: "STUDIO-8",
    name: "Studio Suite",
    available: true,
    max_capacity_per_unit: 8,
    aliases: ["studio", "studio suite"],
    plans: [
      { id: "half-day", name: "Half Day", unit_price: 200 },
      { id: "full-day", name: "Full Day", unit_price: 340 },
    ],
  },
];

function getCatalog() {
  return catalog;
}

function publicCatalog() {
  return catalog.map((product) => ({
    sku: product.sku,
    name: product.name,
    available: product.available,
    max_capacity_per_unit: product.max_capacity_per_unit,
    plans: product.plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      unit_price: plan.unit_price,
    })),
  }));
}

module.exports = { getCatalog, publicCatalog };
