import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDeterministicRoute } from "./routes/router.js";
import { handleUpload } from "./routes/upload.js";
import { handleIpfsUpload, handleIpfsUploadJson } from "./routes/ipfs.js";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  // Increase body size limits to allow base64 image uploads from the client
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  // Deterministic router API (POST /api)
  app.post("/api", handleDeterministicRoute);

  // Simple upload-and-classify endpoint (POST /api/upload)
  app.post(
    "/api/upload",
    ...(Array.isArray(handleUpload) ? handleUpload : [handleUpload]),
  );

  // IPFS endpoints
  app.post(
    "/api/ipfs/upload",
    ...(Array.isArray(handleIpfsUpload) ? handleIpfsUpload : [handleIpfsUpload]),
  );
  app.post("/api/ipfs/upload-json", handleIpfsUploadJson);

  // Debug endpoint to check OpenAI env presence
  app.get("/api/_debug_openai", (req, res) =>
    res.json({ ok: true, hasKey: !!process.env.OPENAI_API_KEY }),
  );

  return app;
}
