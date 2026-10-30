import React from "react";

const STEPS = [
  { id: "discovery", label: "Discovery" },
  { id: "quoted", label: "Quote" },
  { id: "confirming", label: "Confirm" },
  { id: "booked", label: "Booked" },
];

function money(value, currency) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(value);
}

function stepClass(stage, id) {
  const order = STEPS.map((step) => step.id);
  const currentIndex = Math.max(0, order.indexOf(stage || "discovery"));
  const stepIndex = order.indexOf(id);
  if (stage === "booked") return stepIndex === order.length - 1 ? "is-current is-done" : "is-done";
  if (stepIndex < currentIndex) return "is-done";
  if (stepIndex === currentIndex) return "is-current";
  return "";
}

export default function DealSummary({ deal, booking, apiCalls, onReset, onRefreshCatalog }) {
  const stage = booking?.id ? "booked" : deal?.stage || "discovery";
  const hasOrder = Boolean(deal?.product);

  return (
    <aside className="summary" aria-label="Order summary">
      <div className="summary__head">
        <h2>Order</h2>
        <p>{stage === "booked" ? "Booking finished" : "Live quote"}</p>
      </div>

      <ol className="steps">
        {STEPS.map((step) => (
          <li key={step.id} className={stepClass(stage, step.id)}>
            <span className="steps__dot" aria-hidden="true" />
            {step.label}
          </li>
        ))}
      </ol>

      {hasOrder && (
        <dl className="rows">
          <div>
            <dt>Product</dt>
            <dd>{deal.product}</dd>
          </div>
          <div>
            <dt>SKU</dt>
            <dd>{deal.sku || "—"}</dd>
          </div>
          <div>
            <dt>Plan</dt>
            <dd>{deal.plan || "—"}</dd>
          </div>
          <div>
            <dt>Capacity</dt>
            <dd>{deal.requiredCapacity ?? "—"}</dd>
          </div>
          <div>
            <dt>Quantity</dt>
            <dd>{deal.quantity ?? "—"}</dd>
          </div>
          {deal.calculation && (
            <div>
              <dt>Calculation</dt>
              <dd>{deal.calculation}</dd>
            </div>
          )}
          <div>
            <dt>Unit price</dt>
            <dd>{money(deal.unitPrice, deal.currency)}</dd>
          </div>
          <div>
            <dt>Discount</dt>
            <dd className={deal.discountPercent ? "is-discount" : ""}>
              {deal.discountPercent || 0}%
            </dd>
          </div>
          <div>
            <dt>Promo</dt>
            <dd>{deal.discountCode || "none"}</dd>
          </div>
        </dl>
      )}

      {deal?.total != null && (
        <div className="total">
          <span>Total</span>
          <strong>{money(deal.total, deal.currency)}</strong>
        </div>
      )}

      {booking?.id && (
        <div className="booked">
          <strong>{booking.duplicate ? "Already booked" : "Booking confirmed"}</strong>
          <span>Reference {booking.id}</span>
          <span>{booking.duplicate ? "Duplicate request returned the original booking." : "One booking was created."}</span>
        </div>
      )}

      <div className="api-panel">
        <div className="api-panel__head">
          <h3>API calls</h3>
          <button type="button" className="link-btn" onClick={onRefreshCatalog}>
            Refresh catalog
          </button>
        </div>
        {apiCalls.length === 0 && <p className="api-empty">Catalog and booking calls show up here.</p>}
        {apiCalls.map((call, index) => (
          <article key={`${call.method}-${call.url}-${index}`} className="api-card">
            <header>
              <span>{call.method}</span> {call.url}
              {call.status ? <em>{call.status}</em> : null}
            </header>
            {call.request && <pre>{JSON.stringify(call.request, null, 2)}</pre>}
            <pre>{JSON.stringify(call.response ?? call.error ?? {}, null, 2)}</pre>
          </article>
        ))}
      </div>

      <button type="button" className="ghost-btn" onClick={onReset}>
        New conversation
      </button>
    </aside>
  );
}
