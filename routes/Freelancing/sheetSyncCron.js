const cron = require("node-cron");
const { syncLeads } = require("./sheetSyncLeads");

// Run daily at 09:10 (server timezone)
// If your server is not Asia/Kolkata, set TZ=Asia/Kolkata in environment.
function startSheetSyncCron() {
  cron.schedule("10 9 * * *", async () => {
    try {
      const r = await syncLeads({ mode: "daily" });
      console.log("Daily Sheet Sync:", r);
    } catch (e) {
      console.error("Daily Sheet Sync failed:", e);
    }
  });
}

module.exports = { startSheetSyncCron };
