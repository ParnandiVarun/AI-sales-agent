const express = require("express");
const { publicCatalog } = require("../data/catalog");

const router = express.Router();

router.get("/", (req, res) => {
  res.json(publicCatalog());
});

module.exports = router;
