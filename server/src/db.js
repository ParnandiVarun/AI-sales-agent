const mongoose = require("mongoose");

async function connectDb() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ai-sales-agent";
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 2500 });
    console.log(`MongoDB connected (${uri})`);
    return;
  } catch (error) {
    console.warn(`MongoDB at ${uri} is not reachable (${error.message}).`);
    console.warn("Starting an in-memory MongoDB so the demo can still run.");
  }

  const { MongoMemoryServer } = require("mongodb-memory-server");
  const memory = await MongoMemoryServer.create();
  await mongoose.connect(memory.getUri("ai-sales-agent"));
  console.log("In-memory MongoDB connected");
}

module.exports = { connectDb };
