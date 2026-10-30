export async function getCatalog() {
  const res = await fetch("/api/catalog");
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const err = new Error(errorData.error || `Request failed with status ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function sendMessage({ conversationId, message, clientMessageId }) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      conversationId,
      message,
      clientMessageId,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const err = new Error(errorData.error || `Request failed with status ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}
