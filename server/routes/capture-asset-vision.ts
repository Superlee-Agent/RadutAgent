import { Request, Response } from "express";
import { createHash } from "crypto";
import sharp from "sharp";
import OpenAI from "openai";
import {
  addHashToWhitelist,
  checkHashInWhitelist,
} from "../utils/remix-hash-whitelist.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Calculate SHA256 hash of a buffer
 */
function calculateBufferHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Calculate perceptual hash (pHash) using sharp
 * Returns 16-char hex hash (64-bit)
 */
async function calculatePerceptualHash(imageBuffer: Buffer): Promise<string> {
  try {
    // Reduce to 32x32 grayscale for pHash calculation
    const resized = await sharp(imageBuffer)
      .grayscale()
      .resize(32, 32, { fit: "fill" })
      .raw()
      .toBuffer();

    // Calculate average pixel value
    let sum = 0;
    for (let i = 0; i < resized.length; i++) {
      sum += resized[i];
    }
    const avg = sum / resized.length;

    // Generate 64-bit hash
    let hash = "";
    for (let i = 0; i < 64; i++) {
      const regionStart = (i >> 3) * 4 * 32 + (i & 7) * 4;
      let regionSum = 0;
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const pos = regionStart + y * 32 + x;
          if (pos < resized.length) {
            regionSum += resized[pos];
          }
        }
      }
      const regionAvg = regionSum / 16;
      hash += regionAvg > avg ? "1" : "0";
    }

    // Convert binary to hex
    const hashHex =
      parseInt(hash.substring(0, 32), 2).toString(16).padStart(8, "0") +
      parseInt(hash.substring(32, 64), 2).toString(16).padStart(8, "0");

    return hashHex;
  } catch (error) {
    console.warn("Failed to calculate pHash, returning empty string:", error);
    return "";
  }
}

/**
 * Get image vision description from OpenAI
 */
async function getImageVisionDescription(
  imageBuffer: Buffer,
  mediaType: string = "image/png",
): Promise<string | undefined> {
  try {
    // Convert buffer to base64
    const base64 = imageBuffer.toString("base64");

    const response = await openai.vision.image.analyze({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mediaType};base64,${base64}`,
              },
            },
            {
              type: "text",
              text: "Describe this image briefly and concisely (max 200 words). Focus on main elements, style, and content.",
            },
          ],
        },
      ],
    } as any);

    const content = response.choices[0]?.message?.content;
    if (typeof content === "string") {
      return content;
    }

    return undefined;
  } catch (error) {
    console.warn("Failed to get vision description:", error);
    return undefined;
  }
}

/**
 * Silently capture and hash an IP asset when user clicks to expand it
 * POST /api/capture-asset-vision
 * Body: {
 *   mediaUrl: string,
 *   ipId?: string,
 *   title?: string,
 *   mediaType?: string
 * }
 */
export async function handleCaptureAssetVision(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { mediaUrl, ipId = "unknown", title = "IP Asset", mediaType = "image/png" } = req.body;

    if (!mediaUrl || typeof mediaUrl !== "string") {
      return res.status(400).json({ error: "mediaUrl is required" });
    }

    // Check if already in whitelist
    const existingEntry = await checkHashInWhitelist(""); // Will need to implement a check-by-ipId method
    if (existingEntry) {
      console.log(`[Capture Vision] Asset ${ipId} already captured`);
      return res.status(200).json({
        success: true,
        message: "Asset already captured",
        cached: true,
      });
    }

    console.log(`[Capture Vision] Starting capture for ${ipId}...`);

    // Fetch image from URL
    let imageBuffer: Buffer;
    try {
      const response = await fetch(mediaUrl, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}: Failed to fetch image from ${mediaUrl}`,
        );
      }

      imageBuffer = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      console.warn(
        `[Capture Vision] Failed to fetch image for ${ipId}:`,
        error,
      );
      // Don't fail the request if image fetch fails - still return 200
      return res.status(200).json({
        success: false,
        message: "Failed to fetch image, skipping capture",
        ipId,
      });
    }

    // Calculate SHA256 hash
    const hash = calculateBufferHash(imageBuffer);
    console.log(`[Capture Vision] Calculated SHA256 for ${ipId}: ${hash}`);

    // Calculate pHash
    let pHash: string | undefined;
    try {
      pHash = await calculatePerceptualHash(imageBuffer);
      if (pHash) {
        console.log(`[Capture Vision] Calculated pHash for ${ipId}: ${pHash}`);
      }
    } catch (error) {
      console.warn(`[Capture Vision] Failed to calculate pHash for ${ipId}:`, error);
    }

    // Get vision description
    let visionDescription: string | undefined;
    try {
      visionDescription = await getImageVisionDescription(imageBuffer, mediaType);
      if (visionDescription) {
        console.log(
          `[Capture Vision] Got vision description for ${ipId} (${visionDescription.length} chars)`,
        );
      }
    } catch (error) {
      console.warn(
        `[Capture Vision] Failed to get vision description for ${ipId}:`,
        error,
      );
    }

    // Add to whitelist
    try {
      const metadata = {
        ipId,
        title,
        timestamp: Date.now(),
        pHash,
        visionDescription,
      };

      await addHashToWhitelist(hash, metadata);
      console.log(
        `[Capture Vision] Successfully added ${ipId} to whitelist`,
      );

      res.status(200).json({
        success: true,
        message: "Asset vision captured and stored",
        hash,
        pHash,
        hasVisionDescription: !!visionDescription,
        ipId,
      });
    } catch (error) {
      console.warn(
        `[Capture Vision] Failed to add to whitelist for ${ipId}:`,
        error,
      );
      // Still return 200 since the capture process worked
      res.status(200).json({
        success: true,
        message: "Asset vision captured but failed to store to whitelist",
        hash,
        pHash,
        hasVisionDescription: !!visionDescription,
        ipId,
        storageError: true,
      });
    }
  } catch (error) {
    console.error("Capture Asset Vision Error:", error);
    // Always return 200 to avoid disrupting UX
    res.status(200).json({
      success: false,
      message: "Vision capture encountered an error but continues silently",
      error:
        process.env.NODE_ENV !== "production"
          ? (error as any)?.message
          : "Unknown error",
    });
  }
}
