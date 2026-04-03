import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { generalRateLimit } from "./middleware/rate-limit.js";
import routes from "./routes/index.js";

const app = express();

// Core middleware
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));

// Rate limiting (applied globally, uses user ID or IP as key)
app.use(generalRateLimit);

// Routes
app.use("/api", routes);

// Error handling
app.use(errorHandler);

app.listen(env.API_PORT, () => {
  console.log(`[API] Server running on port ${env.API_PORT}`);
});

export default app;
