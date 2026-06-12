const db = require('../db');

const Location = {
  // Add a new location
  add: (room_name, latitude, longitude, floor_number, description = '', callback) => {
    const sql = `
      INSERT INTO locations (room_name, latitude, longitude, floor_number, description)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.query(sql, [room_name, latitude, longitude, floor_number, description], (err, result) => {
      if (err) return callback(err);
      callback(null, result);
    });
  },

  // Get all locations
  getAll: (callback) => {
    const sql = 'SELECT * FROM locations';
    db.query(sql, (err, results) => {
      if (err) return callback(err);
      callback(null, results);
    });
  },

  // Search location by name (partial match)
  searchByName: (name, callback) => {
    const sql = 'SELECT * FROM locations WHERE room_name LIKE ?';
    db.query(sql, `[%${name}%]`, (err, results) => {
      if (err) return callback(err);
      if (results.length === 0) return callback(null, null);
      callback(null, results[0]); // return first match
    });
  },

  // Get location by ID
  getById: (id, callback) => {
    const sql = 'SELECT * FROM locations WHERE id = ?';
    db.query(sql, [id], (err, results) => {
      if (err) return callback(err);
      callback(null, results[0]);
    });
  }
};

module.exports = Location;