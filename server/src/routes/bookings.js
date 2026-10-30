const express = require("express");
const { createBooking } = require("../services/bookingService");

const router = express.Router();

router.post("/", async (req, res, next) => {
  try {
    const result = await createBooking(req.body || {});
    res.status(result.created ? 201 : 200).json(result.booking);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
