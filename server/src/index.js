require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { connectDb } = require("./db");
const catalogRoutes = require("./routes/catalog");
const bookingRoutes = require("./routes/bookings");
const chatRoutes = require("./routes/chat");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});
app.use("/api/catalog", catalogRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/chat", chatRoutes);

app.use((error, req, res, next) => {
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: error.message || "Request failed." });
});

const port = Number(process.env.PORT) || 5000;

connectDb()
  .then(() => {
    app.listen(port, () => {
      console.log(`Sales API listening on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start:", error);
    process.exit(1);
  });
