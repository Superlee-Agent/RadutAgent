import type { Request, Response } from "express";
import sharp from "sharp";
import { checkHashInWhitelist } from "../utils/remix-hash-whitelist.js";

/**
 * Calculate Hamming distance between two perceptual hashes
 */
function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    return 64;
  }

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const xor = parseInt(hash1[i], 16) ^ parseInt(hash2[i], 16);
    for (let j = 0; j < 4; j++) {
      distance += (xor >> j) & 1;
    }
  }

  return distance;
}

/**
 * Calculate similarity percentage from hamming distance
 */
function calculateSimilarityPercent(distance: number): number {
  const similarity = Math.max(0, (64 - distance) / 64) * 100;
  return Math.round(similarity * 10) / 10;
}

/**
 * Calculate perceptual hash from image buffer
 */
async function calculateImagePerceptualHash(
  imageBuffer: Buffer,
): Promise<string | null> {
  try {
    // Reduce image to 32x32 for pHash calculation
    const size = 32;
    const resized = await sharp(imageBuffer)
      .resize(size, size, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const data = resized.data;

    // Calculate average pixel value
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    const avg = sum / data.length;

    // Generate 64-bit hash
    let hash = "";
    for (let i = 0; i < 64; i++) {
      const regionStart = (i >> 3) * 4 * size + (i & 7) * 4;
      let regionSum = 0;
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          if (regionStart + y * size + x < data.length) {
            regionSum += data[regionStart + y * size + x];
          }
        }
      }
      const regionAvg = regionSum / 16;
      hash += regionAvg > avg ? "1" : "0";
    }

    // Convert binary hash to hex
    const hashHex =
      parseInt(hash.substring(0, 32), 2)
        .toString(16)
        .padStart(8, "0") +
      parseInt(hash.substring(32, 64), 2)
        .toString(16)
        .padStart(8, "0");

    return hashHex;
  } catch (error) {
    console.error("Error calculating perceptual hash:", error);
    return null;
  }
}

/**
 * Check if image is similar to any whitelisted images
 * POST /api/check-image-similarity
 * Body: { image: File or base64 string }
 */
export async function handleCheckImageSimilarity(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    let imageBuffer: Buffer | null = null;

    if (req.file) {
      imageBuffer = req.file.buffer;
    } else if (req.body && Buffer.isBuffer(req.body)) {
      imageBuffer = req.body;
    } else if (typeof req.body === "string") {
      imageBuffer = Buffer.from(req.body, "base64");
    }

    if (!imageBuffer || imageBuffer.length === 0) {
      res.status(400).json({
        found: false,
        similarity: 0,
        message: "No image data provided",
      });
      return;
    }

    // Calculate perceptual hash of uploaded image
    const uploadedPHash = await calculateImagePerceptualHash(imageBuffer);

    if (!uploadedPHash) {
      res.status(400).json({
        found: false,
        similarity: 0,
        message: "Failed to process image",
      });
      return;
    }

    // Check against all whitelisted images
    const threshold = 75; // 75% similarity = block
    const results: Array<{
      ipId: string;
      title: string;
      similarity: number;
      distance: number;
    }> = [];

    // Get all whitelist entries (we'll need to read from file)
    const fs = await import("fs/promises");
    const path = await import("path");

    const whitelistPath = path.join(
      process.cwd(),
      "server",
      "data",
      "remix-hashes.json",
    );

    try {
      const content = await fs.readFile(whitelistPath, "utf-8");
      const whitelist = JSON.parse(content);

      for (const entry of whitelist.entries || []) {
        if (entry.pHash) {
          const distance = hammingDistance(uploadedPHash, entry.pHash);
          const similarity = calculateSimilarityPercent(distance);

          results.push({
            ipId: entry.ipId,
            title: entry.title,
            similarity,
            distance,
          });

          // If found similar image above threshold, return immediately
          if (similarity >= threshold) {
            res.status(200).json({
              found: true,
              similarity,
              distance,
              ipId: entry.ipId,
              title: entry.title,
              message: `Image mirip dengan IP "${entry.title}" (${similarity}% match). Tidak dapat registrasi.`,
            });
            return;
          }
        }
      }
    } catch (error) {
      console.warn("Could not read whitelist:", error);
    }

    // No similar images found
    res.status(200).json({
      found: false,
      similarity: 0,
      message: "No similar images found",
      topMatches: results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 3),
    });
  } catch (error) {
    console.error("Error checking image similarity:", error);
    res.status(500).json({
      found: false,
      similarity: 0,
      message: "Error checking image similarity",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
