const express = require("express");
const router = express.Router();

const SECRET =
  process.env.LEAD_WEBHOOK_SECRET ||
  process.env.LEAD_WEBHOOK_KEY ||
  "MyStrongSecret123";

router.post("/api/internal/lead-new", async (req, res) => {
  try {
    const incoming = String(req.headers["x-webhook-secret"] || "");

    if (!SECRET || incoming !== SECRET) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const payload = req.body || {};
    const io = req.app.get("io");

    if (!io) {
      return res.status(500).json({ ok: false, message: "Socket not ready" });
    }

    const sockets = await io.in("sales").fetchSockets();
    console.log(
      "📣 lead-webhook OK. Emitting lead:new:",
      payload?.tempid || payload?.lead_id || "",
      `(sales room: ${sockets.length} socket(s))`
    );

    io.to("sales").emit("lead:new", payload);
    return res.json({ ok: true, listeners: sockets.length });
  } catch (e) {
    console.error("lead-webhook error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

module.exports = router;
