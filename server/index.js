import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import helmet from "helmet";
import cors from "cors";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { z } from "zod";
import { User, Entry } from "./models.js";
import { canTransitionStatus, findMatches } from "./matching.js";
import { structureText, explainMatch } from "./ai.js";
import { GeminiServiceError } from "./gemini.js";
import { structureRequestSchema } from "./ai-contract.js";
import { isLocalDemoEnabled } from "./demo-mode.js";

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env") });

const app = express(),
  port = Number(process.env.PORT) || 4000;
const production = process.env.NODE_ENV === "production";
app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: false,
  }),
);
app.use(express.json({ limit: "32kb" }));
const mediaTempDir = await mkdtemp(path.join(tmpdir(), "hopeconnect-media-"));
const mediaUpload = multer({
  dest: mediaTempDir,
  limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 0 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(["audio/webm", "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "video/webm", "video/mp4", "image/jpeg", "image/png", "image/webp"]);
    const mediaType = file.mimetype.split(";")[0].toLowerCase();
    cb(allowed.has(mediaType) ? null : new Error("Unsupported media type."), allowed.has(mediaType));
  },
});
const mediaLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });
function detectMediaType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") return "video/mp4";
  if (buffer.length >= 4 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE") return "audio/wav";
  if (buffer.length >= 3 && (buffer.toString("ascii", 0, 3) === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0))) return "audio/mpeg";
  if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return "video/webm";
  return "application/octet-stream";
}
const aiLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
const schema = z.object({
  title: z.string().trim().min(2).max(90),
  description: z.string().trim().min(5).max(500),
  category: z.enum([
    "Food",
    "Clothing",
    "Shelter",
    "Education",
    "Healthcare",
    "Other",
  ]),
  location: z.string().trim().min(2).max(80),
  urgency: z.enum(["Normal", "High", "Critical"]),
  quantity: z.number().int().min(1).max(100000),
});
function fail(res, status, error) {
  return res.status(status).json({ error });
}
function validate(schemaToUse, source = "body") {
  return (req, res, next) => {
    const result = schemaToUse.safeParse(req[source]);
    if (!result.success)
      return fail(res, 400, "Invalid input. Check the submitted fields.");
    req.validated = result.data;
    next();
  };
}
let localOwnerPromise;
async function getLocalOwner() {
  if (!localOwnerPromise) localOwnerPromise = (async () => {
    const email = "single-user@hopeconnect.local";
    const passwordHash = await bcrypt.hash(randomUUID(), 12);
    try {
      return await User.findOneAndUpdate(
        { email },
        { $setOnInsert: { name: "Local user", email, passwordHash, role: "member", emailVerified: true, suspended: false, sessionVersion: 0 } },
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
      );
    } catch (error) {
      if (error?.code !== 11000) throw error;
      return User.findOne({ email });
    }
  })();
  try { return await localOwnerPromise; }
  catch (error) { localOwnerPromise = null; throw error; }
}
function protect(req, res, next) {
  if (!isLocalDemoEnabled())
    return fail(res, 403, "Local single-user demo mode is disabled.");
  if (mongoose.connection.readyState !== 1)
    return fail(res, 503, "MongoDB is not connected. Start the local database and retry.");
  getLocalOwner().then((owner) => {
    req.userId = String(owner._id);
    req.userRole = "member";
    next();
  }).catch(next);
}
function requireAdmin(req, res, next) {
  return fail(res, 404, "Not found.");
}
app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    localDemo: isLocalDemoEnabled(),
    database:
      mongoose.connection.readyState === 1 ? "connected" : "not-configured",
    aiConfigured: process.env.AI_PROVIDER === "gemini"
      ? Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL)
      : process.env.AI_PROVIDER === "openrouter"
        ? Boolean(process.env.AI_API_KEY && process.env.AI_MODEL)
        : false,
    aiProvider: process.env.AI_PROVIDER || "rules",
  }),
);
app.all("/api/auth/*", (_req, res) => fail(res, 404, "Authentication routes are disabled for this local single-user app."));
app.get("/api/me", protect, async (req, res, next) => {
  try {
    const owner = await User.findById(req.userId).select("name email role").lean();
    if (!owner) return fail(res, 503, "The local demo identity is unavailable.");
    res.json({ user: { id: String(owner._id), name: owner.name, email: owner.email, role: "member" } });
  } catch (error) { next(error); }
});
app.get("/api/entries", async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1),
      limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const filter = {};
    filter.owner = { $in: await User.find({ emailVerified: true, suspended: false }).distinct("_id") };
    if (["need", "offer"].includes(req.query.kind))
      filter.kind = req.query.kind;
    if (
      ["Open", "Available", "Fulfilled", "Cancelled"].includes(req.query.status)
    )
      filter.status = req.query.status;
    if (
      [
        "Food",
        "Clothing",
        "Shelter",
        "Education",
        "Healthcare",
        "Other",
      ].includes(req.query.category)
    )
      filter.category = req.query.category;
    const [items, total] = await Promise.all([
      Entry.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("owner", "name")
        .lean(),
      Entry.countDocuments(filter),
    ]);
    res.json({ items, total, page, limit });
  } catch (e) {
    next(e);
  }
});
app.get("/api/me/entries", protect, async (req, res, next) => {
  try {
    const items = await Entry.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ items });
  } catch (e) {
    next(e);
  }
});
app.post(
  "/api/entries/:kind",
  protect,
  validate(schema),
  async (req, res, next) => {
    try {
      if (!["need", "offer"].includes(req.params.kind))
        return fail(res, 404, "Not found.");
      const status = req.params.kind === "need" ? "Open" : "Available";
      const entry = await Entry.create({
        ...req.validated,
        kind: req.params.kind,
        status,
        owner: req.userId,
      });
      res.status(201).json({ item: entry });
    } catch (e) {
      next(e);
    }
  },
);
app.get("/api/entries/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return fail(res, 404, "Not found.");
    const item = await Entry.findById(req.params.id)
      .populate("owner", "name")
      .lean();
    if (!item || item.status === "Cancelled" || !(await User.exists({ _id: item.owner?._id, emailVerified: true, suspended: false })))
      return fail(res, 404, "Not found.");
    res.json({ item });
  } catch (e) {
    next(e);
  }
});
app.patch("/api/entries/:id", protect, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return fail(res, 404, "Not found.");
    const allowed = z
      .object({
        title: schema.shape.title.optional(),
        description: schema.shape.description.optional(),
        category: schema.shape.category.optional(),
        location: schema.shape.location.optional(),
        urgency: schema.shape.urgency.optional(),
        quantity: schema.shape.quantity.optional(),
        status: z
          .enum(["Open", "Available", "Fulfilled", "Cancelled"])
          .optional(),
      })
      .strict()
      .safeParse(req.body);
    if (!allowed.success) return fail(res, 400, "Invalid input.");
    const current = await Entry.findById(req.params.id);
    if (!current) return fail(res, 404, "Not found.");
    if (allowed.data.status) {
      if (!canTransitionStatus(current.kind, current.status, allowed.data.status))
        return fail(res, 409, "That status change is not allowed.");
    }
    const item = await Entry.findOneAndUpdate(
      { _id: req.params.id, status: current.status },
      { $set: allowed.data },
      { new: true, runValidators: true },
    );
    if (!item) return fail(res, 409, "This listing changed. Refresh and try again.");
    res.json({ item });
  } catch (e) {
    next(e);
  }
});
app.get("/api/matches", async (_req, res, next) => {
  try {
    const activeOwners = await User.find({ emailVerified: true, suspended: false }).distinct("_id");
    const [needs, offers] = await Promise.all([
      Entry.find({ kind: "need", status: "Open", owner: { $in: activeOwners } }).lean(),
      Entry.find({
        kind: "offer",
        status: "Available",
        quantity: { $gt: 0 },
        owner: { $in: activeOwners },
      }).lean(),
    ]);
    res.json({ matches: findMatches(needs, offers) });
  } catch (e) {
    next(e);
  }
});
app.get("/api/admin/overview", protect, requireAdmin, async (_req, res, next) => {
  try {
    const [users, listings, needs, offers, suspended] = await Promise.all([
      User.countDocuments({ emailVerified: true }), Entry.countDocuments(),
      Entry.countDocuments({ kind: "need" }), Entry.countDocuments({ kind: "offer" }), User.countDocuments({ suspended: true }),
    ]);
    res.json({ stats: { users, listings, needs, offers, suspended } });
  } catch (e) { next(e); }
});
app.get("/api/admin/users", protect, requireAdmin, async (_req, res, next) => {
  try { const users = await User.find().select("name email role emailVerified suspended createdAt").sort({ createdAt: -1 }).limit(200).lean(); res.json({ users }); }
  catch (e) { next(e); }
});
app.patch("/api/admin/users/:id", protect, requireAdmin, validate(z.object({ suspended: z.boolean() }).strict()), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id) || req.params.id === req.userId) return fail(res, 400, "Invalid account action.");
    const user = await User.findByIdAndUpdate(req.params.id, { $set: { suspended: req.validated.suspended }, $inc: { sessionVersion: 1 } }, { new: true }).select("name email role emailVerified suspended");
    if (!user) return fail(res, 404, "Account not found.");
    res.json({ user });
  } catch (e) { next(e); }
});
app.get("/api/admin/entries", protect, requireAdmin, async (_req, res, next) => {
  try { const items = await Entry.find().populate("owner", "name email").sort({ createdAt: -1 }).limit(300).lean(); res.json({ items }); }
  catch (e) { next(e); }
});
app.patch("/api/admin/entries/:id", protect, requireAdmin, validate(z.object({ status: z.enum(["Open", "Available", "Fulfilled", "Cancelled"]) }).strict()), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "Listing not found.");
    const item = await Entry.findByIdAndUpdate(req.params.id, { $set: { status: req.validated.status } }, { new: true, runValidators: true });
    if (!item) return fail(res, 404, "Listing not found.");
    res.json({ item });
  } catch (e) { next(e); }
});
app.post(
  "/api/ai/structure",
  protect,
  aiLimit,
  validate(structureRequestSchema),
  async (req, res) => {
    const controller = new AbortController();
    const cancelOnDisconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.once("close", cancelOnDisconnect);
    try {
      res.json({ result: await structureText(req.validated.text, req.validated.kind, { signal: controller.signal }) });
    } catch (error) {
      const status = error instanceof GeminiServiceError
        ? ["configuration", "authentication", "model_not_found", "network", "unavailable"].includes(error.code) ? 503
          : error.code === "rate_limit" ? 429
            : error.code === "timeout" ? 504
              : error.code === "cancelled" ? 499
                : error.code === "invalid_request" ? 400 : 502
        : 502;
      if (!res.destroyed) res.status(status).json({ error: error instanceof GeminiServiceError ? error.message : "AI service is temporarily unavailable. Please retry or enter the details manually." });
    } finally {
      res.off("close", cancelOnDisconnect);
    }
  },
);
app.post("/api/assistant/media", protect, mediaLimit, (req, res, next) => {
  mediaUpload.single("media")(req, res, async (uploadError) => {
    if (uploadError) return fail(res, uploadError.code === "LIMIT_FILE_SIZE" ? 413 : 400, uploadError.code === "LIMIT_FILE_SIZE" ? "Media must be 25 MB or smaller." : "Unsupported media type.");
    if (!req.file) return fail(res, 400, "Choose a media file to process.");
    try {
      const bytes = await readFile(req.file.path);
      const detected = detectMediaType(bytes);
      const declared = req.file.mimetype;
      const imageOk = detected === declared;
      const audioOk = declared.startsWith("audio/") && (detected.startsWith("audio/") || detected === "video/webm" || detected === "video/mp4");
      const videoOk = declared.startsWith("video/") && (detected.startsWith("video/") || (declared === "video/mp4" && detected === "video/mp4"));
      if (!imageOk && !audioOk && !videoOk) return fail(res, 415, "The file contents do not match a supported image, audio, or video format.");
      if (!audioOk) return fail(res, 501, detected.startsWith("image/") ? "Private temporary upload validated. Image analysis is not configured." : "Private temporary upload validated. Video audio extraction and frame analysis are not configured.");
      if (!process.env.STT_API_KEY || !process.env.STT_MODEL) return fail(res, 503, "Audio upload is available, but transcription needs STT_API_KEY and STT_MODEL configured on the server.");
      const form = new FormData();
      form.append("model", process.env.STT_MODEL);
      form.append("file", new Blob([bytes], { type: declared }), req.file.originalname.replace(/[\r\n"\\]/g, "_").slice(0, 100) || "recording.webm");
      const base = (process.env.STT_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
      const provider = await fetch(`${base}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${process.env.STT_API_KEY}` }, body: form, signal: AbortSignal.timeout(45000) });
      if (!provider.ok) return fail(res, provider.status === 429 ? 429 : 502, provider.status === 429 ? "Transcription provider rate limit reached. Please retry later." : "Transcription provider could not process this recording.");
      const result = await provider.json();
      if (typeof result.text !== "string" || !result.text.trim()) return fail(res, 502, "The transcription provider returned no transcript.");
      res.json({ transcript: result.text.slice(0, 8000), processed: true, retention: "Temporary upload deleted after processing." });
    } catch (error) {
      if (!res.headersSent) return fail(res, error.name === "TimeoutError" ? 504 : 502, error.name === "TimeoutError" ? "Transcription timed out. You can safely retry." : "Media processing failed. Please try again.");
      next(error);
    } finally {
      await rm(req.file.path, { force: true }).catch(() => {});
    }
  });
});
app.post(
  "/api/ai/explain-match",
  protect,
  aiLimit,
  validate(
    z.object({
      need: z.object({
        category: schema.shape.category,
        location: schema.shape.location,
        quantity: schema.shape.quantity,
        urgency: schema.shape.urgency,
      }),
      offer: z.object({
        category: schema.shape.category,
        location: schema.shape.location,
        quantity: schema.shape.quantity,
      }),
    }),
  ),
  async (req, res) => {
    try {
      res.json(await explainMatch(req.validated.need, req.validated.offer));
    } catch {
      res.json(await explainMatch(req.validated.need, req.validated.offer));
    }
  },
);
app.use((err, _req, res, _next) => {
  if (!production) console.error("Request failed:", err.message);
  if (err?.name === "ValidationError" || err?.code === 11000)
    return fail(res, 400, "The submitted information could not be saved.");
  return fail(res, 500, "Something went wrong. Please try again.");
});
if (process.env.MONGODB_URI) {
  mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => console.log("MongoDB connected"))
    .catch((error) => {
      console.error("MongoDB connection failed:", error.message);
      process.exitCode = 1;
    });
}
app.listen(port, "127.0.0.1", () => console.log(`HopeConnect API listening on 127.0.0.1:${port} (local single-user mode)`));
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
  void rm(mediaTempDir, { recursive: true, force: true }).finally(() => process.exit(0));
});
export { app };
