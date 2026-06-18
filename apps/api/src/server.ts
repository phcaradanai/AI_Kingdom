import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { startKingdomScheduler, stopKingdomScheduler } from "./services/kingdomSchedulerService.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`AI Kingdom API listening on http://localhost:${env.PORT}`);
  // Start the autonomy worker. It ticks on an interval but does nothing until the
  // King turns on LIVING_LOOP_ENABLED — at which point the Kingdom keeps working
  // on its own (observe -> propose -> act) between decrees.
  startKingdomScheduler();
});

function shutdown(signal: string): void {
  console.log(`[server] received ${signal}, shutting down`);
  stopKingdomScheduler();
  server.close(() => process.exit(0));
  // Failsafe: force-exit if the server doesn't close in time.
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
