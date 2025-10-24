import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleUpload } from "./routes/upload.js";
import { handleIpfsUpload, handleIpfsUploadJson } from "./routes/ipfs.js";
import { handleDescribe } from "./routes/describe.js";
import { handleCheckIpAssets } from "./routes/check-ip-assets.js";
import { handleSearchIpAssets } from "./routes/search-ip-assets.js";
import { handleSearchByOwner } from "./routes/search-by-owner.js";
import { handleParseSearchIntent } from "./routes/parse-search-intent.js";
import { handleGetSuggestions } from "./routes/get-suggestions.js";
import { handleResolveIpName } from "./routes/resolve-ip-name.js";

export function createServer() {
  const app = express();

  // Middleware
  // CORS configuration - allow requests from the same origin and common localhost/preview domains
  const corsOptions = {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests with no origin (mobile apps, curl, etc)
      if (!origin) {
        callback(null, true);
        return;
      }

      // Allow development and preview environments
      const allowedOrigins = [
        "localhost",
        "127.0.0.1",
        ".vercel.app",
        ".netlify.app",
        process.env.APP_ORIGIN || "",
      ];

      const isAllowed = allowedOrigins.some((allowedOrigin) =>
        origin.includes(allowedOrigin),
      );

      if (isAllowed) {
        callback(null, true);
      } else {
        // Log suspicious origins in production
        if (process.env.NODE_ENV === "production") {
          console.warn(`CORS request from unauthorized origin: ${origin}`);
        }
        callback(null, true); // Still allow to prevent breaking clients, but log it
      }
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    maxAge: 3600,
  };

  app.use(cors(corsOptions));

  // Set security headers
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    next();
  });

  // Increase body size limits to allow base64 image uploads from the client
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  // Simple upload-and-classify endpoint (POST /api/upload)
  app.post(
    "/api/upload",
    ...(Array.isArray(handleUpload) ? handleUpload : [handleUpload]),
  );

  // IPFS endpoints
  app.post(
    "/api/ipfs/upload",
    ...(Array.isArray(handleIpfsUpload)
      ? handleIpfsUpload
      : [handleIpfsUpload]),
  );
  app.post("/api/ipfs/upload-json", handleIpfsUploadJson);

  // Generate title/description on demand (POST /api/describe)
  app.post(
    "/api/describe",
    ...(Array.isArray(handleDescribe) ? handleDescribe : [handleDescribe]),
  );

  // Check IP Assets endpoint (POST /api/check-ip-assets)
  app.post("/api/check-ip-assets", handleCheckIpAssets);

  // Search IP Assets endpoint (POST /api/search-ip-assets)
  app.post("/api/search-ip-assets", handleSearchIpAssets);

  // Search IP Assets by Owner endpoint (POST /api/search-by-owner)
  app.post("/api/search-by-owner", handleSearchByOwner);

  // Parse search intent endpoint (POST /api/parse-search-intent)
  app.post("/api/parse-search-intent", handleParseSearchIntent);

  // Get typing suggestions endpoint (POST /api/get-suggestions)
  app.post("/api/get-suggestions", handleGetSuggestions);

  // Debug endpoint to check OpenAI env presence
  app.get("/api/_debug_openai", (req, res) =>
    res.json({ ok: true, hasKey: !!process.env.OPENAI_API_KEY }),
  );

  return app;
}
