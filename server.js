// === file: server.js ========================================================
// Entry point: wires middleware, static, routers, DB init, seeding & server start
import dotenv from "dotenv"; dotenv.config();
import express from "express";
import morgan from "morgan";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { router as scoreOpenRouter } from "./server/routes/ai-open-scoring.js"; // your existing router
import demographicsRouter from "./server/routes/demographics-router.js";

// Local modules
import { initSchema } from "./server/db/schema.js";
import subjectsRouter from "./server/routes/subjects.js";
import manualeRouter from "./server/routes/human_scoring.js";
import saveRouter from "./server/routes/save.js";
import itemsRouter from "./server/routes/item-loader.js";
import { getDB } from "./server/db/sqlite.js";
import progressRouter from "./server/routes/progress.js";
import teacherSessionRouter from "./server/routes/teacher-session.js";
import startNote from "./server/routes/start.js";
import motivationDailyRouter from "./server/routes/motivation-daily-router.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const PAGES_DIR = path.join(__dirname, "public", "pages");
const DATA_DIR = path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

// --- App ---
const app = express();
app.use(morgan("[:date[iso]] :method :url :status :res[content-length] - :response-time ms"));
app.use(express.json({ limit: "10mb" }));
app.use(express.static(PAGES_DIR));
app.use(express.static(PUBLIC_DIR));

app.get("/teacher-session", (_req, res) => {
  res.sendFile(path.join(PAGES_DIR, "teacher-session.html"));
});

// Serve specific page
app.get("/manuale-scoring", (_req, res) => {
  res.sendFile(path.join(PAGES_DIR, "manuale-scoring.html"));
});

// Health check
app.get("/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), timestamp: new Date().toISOString() });
});


// --- DB init & seed ---

const db = getDB(path.join(DATA_DIR, "test.db"));
initSchema(db);
app.locals.db = db;

// --- Routers ---
app.use("/api/motivation-daily", motivationDailyRouter(db));

app.use(subjectsRouter(db));      // /api/subject-summary, /api/theta, /api/completed-items
app.use(manualeRouter(db));       // /api/manuale/*
app.use(saveRouter(db));          // /api/save (triggers R estimation service)
app.use(startNote(db));
app.use(scoreOpenRouter);         // keep your existing router mounted
app.use("/api/items", itemsRouter(db));
app.use("/api/demographics", demographicsRouter(db));
app.use(progressRouter(db));
app.use(teacherSessionRouter(db));


// 404
app.use((req, res) => res.status(404).json({ error: "Not found" }));
// Error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log(`Server läuft auf http://localhost:${PORT}`));