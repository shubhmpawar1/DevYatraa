import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { errorHandler, jwtSecret, requireAuth } from "./http.js";
import { aiEnabled, MODEL } from "./grading.js";
import { authRouter } from "./routes/auth.js";
import { profileRouter } from "./routes/profile.js";
import { daysRouter } from "./routes/days.js";
import { miscRouter } from "./routes/misc.js";

jwtSecret(); // fail fast if missing

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:4200" }));
app.use(express.json({ limit: "200kb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, aiGrading: aiEnabled() }));
app.use("/api/auth", authRouter);
app.use("/api", requireAuth, profileRouter);
app.use("/api/days", requireAuth, daysRouter);
app.use("/api", requireAuth, miscRouter);

// In production, serve the built Angular app from the same server.
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, "../../client/dist/client/browser");
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

app.use(errorHandler);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`API on http://localhost:${port}`);
  console.log(aiGradingLine());
});

function aiGradingLine() {
  return aiEnabled()
    ? `AI grading: on (${MODEL})`
    : "AI grading: off. Set ANTHROPIC_API_KEY in server/.env to enable it; self-assessment is used until then.";
}
