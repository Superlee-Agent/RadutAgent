import type { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";

/**
 * SINGLE POWERFUL SOLUTION: OpenAI Vision-based Image Detection
 * 
 * Extracts semantic features from images using GPT-4 Vision
 * Compares with stored descriptions to detect similar images
 * Works better than pHash because it understands image content/meaning
 * 
 * POST /api/vision-image-detection
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface VisionResult {
  blocked: boolean;
  message?: string;
  matchedIp?: string;
  matchedTitle?: string;
  similarity: number;
}

/**
 * Convert image buffer to base64
 */
function bufferToBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

/**
 * Get image analysis from OpenAI Vision API
 */
async function analyzeImageWithVision(
  imageBase64: string,
): Promise<string | null> {
  try {
    if (!OPENAI_API_KEY) {
      console.warn("OPENAI_API_KEY not configured");
      return null;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4-vision-preview",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                },
              },
              {
                type: "text",
                text: "Describe this image in detail. Focus on: main subjects, objects, characters, colors, style, composition, distinctive features. Be concise but specific. Output only the description without any preamble.",
              },
            ],
          },
        ],
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("OpenAI Vision API error:", error);
      return null;
    }

    const data = (await response.json()) as any;
    const description = data.choices?.[0]?.message?.content;

    return description || null;
  } catch (error) {
    console.error("Error calling OpenAI Vision API:", error);
    return null;
  }
}

/**
 * Calculate similarity between two text descriptions
 * Simple approach: count common words
 * Production: use embedding model for semantic similarity
 */
function calculateDescriptionSimilarity(desc1: string, desc2: string): number {
  if (!desc1 || !desc2) return 0;

  const words1 = new Set(desc1.toLowerCase().split(/\s+/));
  const words2 = new Set(desc2.toLowerCase().split(/\s+/));

  let matches = 0;
  for (const word of words1) {
    if (words2.has(word) && word.length > 3) {
      // Only count meaningful words (>3 chars)
      matches++;
    }
  }

  const totalWords = Math.max(words1.size, words2.size);
  if (totalWords === 0) return 0;

  return Math.round((matches / totalWords) * 100);
}

/**
 * Vision-based image detection
 * Most powerful single solution: semantic understanding of images
 */
export async function handleVisionImageDetection(
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
      const result: VisionResult = {
        blocked: false,
        similarity: 0,
      };
      res.status(200).json(result);
      return;
    }

    // Analyze uploaded image with Vision API
    const uploadedDescription = await analyzeImageWithVision(
      bufferToBase64(imageBuffer),
    );

    if (!uploadedDescription) {
      // Vision API failed - allow to proceed (fail open)
      const result: VisionResult = {
        blocked: false,
        similarity: 0,
        message: "Could not analyze image, proceeding with registration",
      };
      res.status(200).json(result);
      return;
    }

    // Read whitelist
    const whitelistPath = path.join(
      process.cwd(),
      "server",
      "data",
      "remix-hashes.json",
    );

    let whitelist: any = { entries: [] };
    try {
      const content = await fs.readFile(whitelistPath, "utf-8");
      whitelist = JSON.parse(content);
    } catch (error) {
      console.warn("Could not read whitelist:", error);
    }

    // Compare with all whitelisted images
    let bestMatch = null;
    let bestSimilarity = 0;

    for (const entry of whitelist.entries || []) {
      // If entry doesn't have vision description, analyze it now
      if (!entry.visionDescription) {
        // TODO: In production, store vision descriptions when images are added
        // For now, skip entries without descriptions
        continue;
      }

      const similarity = calculateDescriptionSimilarity(
        uploadedDescription,
        entry.visionDescription,
      );

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = entry;
      }
    }

    // Block if similarity >= 65% (sensitive threshold)
    if (bestSimilarity >= 65 && bestMatch) {
      const result: VisionResult = {
        blocked: true,
        message: `Image mirip dengan IP "${bestMatch.title}" (${bestSimilarity}% match). Tidak dapat registrasi.`,
        matchedIp: bestMatch.ipId,
        matchedTitle: bestMatch.title,
        similarity: bestSimilarity / 100,
      };
      res.status(200).json(result);
      return;
    }

    // No match - allow registration
    const result: VisionResult = {
      blocked: false,
      similarity: 0,
      message: `Image analyzed. Proceeding with registration.`,
    };
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in vision image detection:", error);
    res.status(500).json({
      blocked: false,
      similarity: 0,
      message: "Error analyzing image",
    });
  }
}
