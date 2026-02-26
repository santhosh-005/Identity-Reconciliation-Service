import app from "./app";
import { env } from "./config/env";
import { disconnectPrisma } from "./config/prisma";

const server = app.listen(env.PORT, () => {
  console.log(
    `🚀 Server running on port ${env.PORT} in ${env.NODE_ENV} mode`
  );
});

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  await disconnectPrisma();
  console.log("Database connection closed.");
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

export default server;
