const express = require("express");
const path = require("path");

const app = express();

// ✅ Serve frontend files
app.use(express.static(path.join(__dirname, "../frontend")));

// ✅ Parse JSON requests
app.use(express.json());

// ✅ Routes
app.use("/api/locations", require("./Routes/locationRoutes"));

// ✅ Default route — serve index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// ✅ Start the server
const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running at:`);
  console.log(`   Local:  http://localhost:${PORT}`);
  console.log(`   LAN:    http://10.235.164.7:${PORT}`); // 👈 your LAN IP


  // ✅ Dynamically import 'open' (since open@10 is pure ESM)
  import("open")
    .then(({ default: open }) => {
      open(`http://localhost:${PORT}/index.html`);
    })
    .catch((err) => {
      console.error("❌ Failed to open browser:", err);
    });
});