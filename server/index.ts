import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { handleUpload } from "./routes/upload.js";
import { handleIpfsUpload, handleIpfsUploadJson } from "./routes/ipfs.js";
import { handleDescribe } from "./routes/describe.js";
import { handleCheckIpAssets } from "./routes/check-ip-assets.js";
import { handleSearchIpAssets } from "./routes/search-ip-assets.js";
import { handleSearchByOwner } from "./routes/search-by-owner.js";
import { handleParseSearchIntent } from "./routes/parse-search-intent.js";
import { handleGetSuggestions } from "./routes/get-suggestions.js";
import { handleResolveIpName } from "./routes/resolve-ip-name.js";
import handleVerifyWatermark from "./routes/verify-watermark.js";
import {
  handleAddRemixHash,
  handleCheckRemixHash,
  handleGetRemixHashes,
} from "./routes/remix-hash-whitelist.js";
import { handleCheckImageSimilarity } from "./routes/check-image-similarity.js";
import { handleVisionImageDetection } from "./routes/vision-image-detection.js";
import { handleAnalyzeImageVision } from "./routes/analyze-image-vision.js";
import { handleCaptureAssetVision } from "./routes/capture-asset-vision.js";

async function fetchParentIpDetails(
  childIpId: string,
  apiKey: string,
): Promise<any> {
  try {
    const response = await fetch(
      "https://api.storyapis.com/api/v4/assets/edges",
      {
        method: "POST",
        headers: {
          "X-Api-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          where: {
            childIpId: childIpId,
          },
          pagination: {
            limit: 100,
            offset: 0,
          },
        }),
      },
    );

    if (!response.ok) {
      console.warn(
        `Failed to fetch parent details for ${childIpId}: ${response.status}`,
      );
      return null;
    }

    const data = await response.json();
    if (!Array.isArray(data.data) || data.data.length === 0) {
      return null;
    }

    const edges = data.data;
    return {
      parentIpIds: edges.map((edge: any) => edge.parentIpId),
      licenseTermsIds: edges.map((edge: any) => edge.licenseTermsId),
      licenseTemplates: edges.map((edge: any) => edge.licenseTemplate),
      edges: edges,
    };
  } catch (error) {
    console.warn(`Error fetching parent details for ${childIpId}:`, error);
    return null;
  }
}

export function createServer() {
  const app = express();

  // Setup multer for image upload handling in watermark verification
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
  });

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

  // Resolve IP name endpoint (POST /api/resolve-ip-name)
  app.post("/api/resolve-ip-name", handleResolveIpName);

  // Get typing suggestions endpoint (POST /api/get-suggestions)
  app.post("/api/get-suggestions", handleGetSuggestions);

  // Verify watermark endpoint (POST /api/verify-watermark)
  app.post(
    "/api/verify-watermark",
    upload.single("image"),
    handleVerifyWatermark,
  );

  // Remix hash whitelist endpoints
  app.post("/api/add-remix-hash", handleAddRemixHash);
  app.post("/api/check-remix-hash", handleCheckRemixHash);
  app.get("/api/_admin/remix-hashes", handleGetRemixHashes);

  // Image similarity detection endpoint
  app.post(
    "/api/check-image-similarity",
    upload.single("image"),
    handleCheckImageSimilarity,
  );

  // Vision-based image detection endpoint (most powerful)
  app.post(
    "/api/vision-image-detection",
    upload.single("image"),
    handleVisionImageDetection,
  );

  // Analyze image with Vision API endpoint
  app.post("/api/analyze-image-vision", handleAnalyzeImageVision);

  // Debug endpoint to fetch parent IP details for a given IP ID
  app.get("/api/_debug/parent-details/:ipId", async (req, res) => {
    try {
      const { ipId } = req.params;
      const apiKey = process.env.STORY_API_KEY;

      if (!apiKey) {
        return res.status(500).json({
          ok: false,
          error: "API key not configured",
        });
      }

      // Fetch the asset details
      const response = await fetch("https://api.storyapis.com/api/v4/assets", {
        method: "POST",
        headers: {
          "X-Api-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          where: {
            ipIds: [ipId],
          },
          pagination: {
            limit: 1,
            offset: 0,
          },
        }),
      });

      if (!response.ok) {
        return res.status(response.status).json({
          ok: false,
          error: `API returned ${response.status}`,
        });
      }

      const data = await response.json();
      const asset = data?.data?.[0];

      // Fetch parent IP details if asset is a derivative
      let parentIpDetails = null;
      if (asset?.parentsCount && asset.parentsCount > 0) {
        parentIpDetails = await fetchParentIpDetails(ipId, apiKey);
      }

      return res.json({
        ok: true,
        ipId,
        status: response.status,
        asset: asset,
        parentsCount: asset?.parentsCount,
        parentIpDetails: parentIpDetails,
        message: "Asset details with parent IP information",
      });
    } catch (error: any) {
      res.status(500).json({
        ok: false,
        error: error?.message || "Failed to fetch asset details",
      });
    }
  });

  // Debug endpoint to check OpenAI env presence
  app.get("/api/_debug_openai", (req, res) =>
    res.json({ ok: true, hasKey: !!process.env.OPENAI_API_KEY }),
  );

  return app;
}
