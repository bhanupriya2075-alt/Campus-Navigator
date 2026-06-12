const express = require("express");
const router = express.Router();
const db = require("../db"); // your MySQL connection

// GET all locations
router.get("/", async (req, res) => {
  db.query("SELECT * FROM locations", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// GET single location by ID
router.get("/:id", (req, res) => {
  const id = req.params.id;
  db.query("SELECT * FROM locations WHERE id = ?", [id], (err, results) => {
    if (err || results.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(results[0]);
  });
});

// ADD new location
router.post("/add", (req, res) => {
  const { room_name, latitude, longitude, floor_number, description } = req.body;
  db.query(
    "INSERT INTO locations (room_name, latitude, longitude, floor_number, description) VALUES (?, ?, ?, ?, ?)",
    [room_name, latitude, longitude, floor_number, description],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Location added successfully" });
    }
  );
});

// UPDATE existing location
router.put("/:id", (req, res) => {
  const id = req.params.id;
  const { room_name, latitude, longitude, floor_number, description } = req.body;
  db.query(
    "UPDATE locations SET room_name=?, latitude=?, longitude=?, floor_number=?, description=? WHERE id=?",
    [room_name, latitude, longitude, floor_number, description, id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Location updated successfully" });
    }
  );
});

// DELETE location
router.delete("/:id", (req, res) => {
  const id = req.params.id;
  db.query("DELETE FROM locations WHERE id = ?", [id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Location deleted successfully" });
  });
});

module.exports = router;