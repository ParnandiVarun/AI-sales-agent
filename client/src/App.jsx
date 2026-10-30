import React, { useCallback, useEffect, useRef, useState } from "react";
import ChatWindow from "./components/ChatWindow.jsx";
import DealSummary from "./components/DealSummary.jsx";
import { getCatalog, sendMessage } from "./services/chatApi.js";

const GREETING = {
  id: "greeting",
  role: "assistant",
  text: "Hi, I can help you find the right product and plan, work out the quantity you need and book it. What are you looking for?",
  ts: Date.now(),
};

const STARTERS = ["Show me what's available", "I need a quote"];
const CONFIRM_REPLIES = ["Yes, confirm", "Change quantity"];
const EMPTY_DEAL = { stage: "discovery" };

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function App() {
  const [messages, setMessages] = useState([GREETING]);
  const [deal, setDeal] = useState(EMPTY_DEAL);
  const [booking, setBooking] = useState(null);
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState(STARTERS);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [apiCalls, setApiCalls] = useState([]);

  const lockRef = useRef(false);
  const convRef = useRef(null);

  const rememberCatalog = useCallback((payload) => {
    setApiCalls((prev) => {
      const rest = prev.filter((call) => !(call.method === "GET" && call.url === "/api/catalog"));
      return [payload, ...rest];
    });
  }, []);

  const loadCatalog = useCallback(async () => {
    try {
      const data = await getCatalog();
      rememberCatalog({ method: "GET", url: "/api/catalog", status: 200, response: data });
    } catch (err) {
      rememberCatalog({
        method: "GET",
        url: "/api/catalog",
        status: err.status || 0,
        error: err.message || "Catalog request failed",
      });
    }
  }, [rememberCatalog]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const patchMessage = (id, patch) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const deliver = useCallback(async (text, clientMessageId) => {
    if (lockRef.current) return;
    lockRef.current = true;
    setSending(true);
    setSuggestions([]);

    try {
      const data = await sendMessage({
        conversationId: convRef.current,
        message: text,
        clientMessageId,
      });

      convRef.current = data.conversationId ?? convRef.current;
      patchMessage(clientMessageId, { status: "sent", error: null });
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", text: data.reply, ts: Date.now() },
      ]);

      const nextDeal = data.state || EMPTY_DEAL;
      setDeal(nextDeal);
      if (data.booking) setBooking(data.booking);

      if (data.apiCalls?.length) {
        setApiCalls((prev) => [...prev, ...data.apiCalls].slice(-12));
      }

      if (data.suggestions?.length) setSuggestions(data.suggestions);
      else if (nextDeal.stage === "confirming") setSuggestions(CONFIRM_REPLIES);
      else setSuggestions([]);
    } catch (err) {
      patchMessage(clientMessageId, {
        status: "failed",
        error: err.message || "Not sent",
      });
    } finally {
      lockRef.current = false;
      setSending(false);
    }
  }, []);

  const handleSend = useCallback(
    (text) => {
      if (lockRef.current) return;
      const id = uid();
      setMessages((prev) => [
        ...prev,
        { id, role: "user", text, ts: Date.now(), status: "sending" },
      ]);
      deliver(text, id);
    },
    [deliver]
  );

  const handleRetry = useCallback(
    (message) => {
      if (lockRef.current) return;
      patchMessage(message.id, { status: "sending", error: null });
      deliver(message.text, message.id);
    },
    [deliver]
  );

  const handleReset = () => {
    if (lockRef.current) return;
    convRef.current = null;
    setMessages([{ ...GREETING, ts: Date.now() }]);
    setDeal(EMPTY_DEAL);
    setBooking(null);
    setSuggestions(STARTERS);
    setSummaryOpen(false);
    setApiCalls([]);
    loadCatalog();
  };

  return (
    <div className={`app ${summaryOpen ? "app--summary-open" : ""}`}>
      <ChatWindow
        messages={messages}
        sending={sending}
        suggestions={suggestions}
        onSend={handleSend}
        onRetry={handleRetry}
        onToggleSummary={() => setSummaryOpen((v) => !v)}
      />
      <DealSummary
        deal={deal}
        booking={booking}
        apiCalls={apiCalls}
        onReset={handleReset}
        onRefreshCatalog={loadCatalog}
      />
    </div>
  );
}
