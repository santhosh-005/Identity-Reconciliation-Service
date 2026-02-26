import express from "express";
import cors from "cors";
import identifyRoute from "./routes/identify.route";
import { errorHandler } from "./middlewares/error-handler";
import { requestLogger } from "./middlewares/request-logger";

const app = express();

// --------------- Middleware ---------------
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// --------------- Health Check ---------------
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// --------------- Routes ---------------
app.use(identifyRoute);

// --------------- 404 Handler ---------------
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// --------------- Global Error Handler ---------------
app.use(errorHandler);

export default app;
