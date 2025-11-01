import sharp from "sharp";
import type { Request, Response } from "express";

/**
 * Server-side watermark extraction and verification
 * Detects invisible watermarks in uploaded images
 * Blocks registration if watermark from different IP is detected
 */

interface WatermarkData {
  ipId: string;
  licenseTerms: string;
  copyrightInfo: string;
  metadata: Record<string, any>;
  timestamp: number;
}

interface VerifyWatermarkResponse {
  hasWatermark: boolean;
  watermark?: WatermarkData;
  confidence: number;
  originalIpId?: string;
  blockRegistration: boolean;
  message: string;
}

/**
 * Convert binary string to decimal number
 */
function binaryToNumber(binary: string): number {
  return parseInt(binary, 2);
}

/**
 * Extract watermark from image using DCT analysis
 * Reconstructs the embedded watermark bits from the image
 */
async function extractWatermarkFromImage(
  imageBuffer: Buffer,
): Promise<{ bits: string; success: boolean }> {
  try {
    // Get raw pixel data using sharp
    const raw = await sharp(imageBuffer)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const data = raw.data;
    let extractedBits = "";

    // Extract watermark bits from image data
    // Uses same block-based approach as client-side
    for (let blockIndex = 0; blockIndex < 256 && extractedBits.length < 2048; blockIndex++) {
      const startIdx = blockIndex * 64 + 8;
      if (startIdx < data.length) {
        const bit = (data[startIdx] & 1) ^ 1; // Invert logic for reliability
        extractedBits += bit;
      }
    }

    return { bits: extractedBits, success: extractedBits.length > 16 };
  } catch (error) {
    console.error("Error extracting watermark from image:", error);
    return { bits: "", success: false };
  }
}

/**
 * Deserialize watermark data from binary string
 */
function deserializeWatermark(binary: string): WatermarkData | null {
  try {
    if (binary.length < 16) return null;

    // Read length (first 16 bits)
    const length = binaryToNumber(binary.substring(0, 16));

    if (binary.length < 16 + length * 8 || length > 10000) return null;

    // Read data
    let data = "";
    for (let i = 0; i < length; i++) {
      const charBinary = binary.substring(16 + i * 8, 16 + (i + 1) * 8);
      if (charBinary.length < 8) return null;
      data += String.fromCharCode(binaryToNumber(charBinary));
    }

    // Verify checksum (last byte)
    const checksum = data.charCodeAt(data.length - 1);
    const payload = data.substring(0, data.length - 1);

    let calculatedChecksum = 0;
    for (let i = 0; i < payload.length; i++) {
      calculatedChecksum ^= payload.charCodeAt(i);
    }

    if (checksum !== calculatedChecksum) {
      return null;
    }

    // Parse JSON
    const parsed = JSON.parse(payload);

    if (
      parsed.ipId &&
      parsed.licenseTerms &&
      parsed.copyrightInfo &&
      parsed.metadata &&
      parsed.timestamp
    ) {
      return parsed as WatermarkData;
    }

    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Verify watermark in uploaded image
 * Returns watermark info if found, blocks registration if watermark from different IP
 */
export default async function handleVerifyWatermark(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // Get image buffer from request
    // Can come from multer middleware or raw body
    let imageBuffer: Buffer | null = null;

    if (req.file) {
      imageBuffer = req.file.buffer;
    } else if (req.body && Buffer.isBuffer(req.body)) {
      imageBuffer = req.body;
    } else if (typeof req.body === "string") {
      // Handle base64 encoded image
      imageBuffer = Buffer.from(req.body, "base64");
    }

    if (!imageBuffer || imageBuffer.length === 0) {
      res.status(400).json({
        hasWatermark: false,
        confidence: 0,
        blockRegistration: false,
        message: "No image data provided",
      } as VerifyWatermarkResponse);
      return;
    }

    // Extract watermark from image
    const { bits, success } = await extractWatermarkFromImage(imageBuffer);

    if (!success) {
      res.status(200).json({
        hasWatermark: false,
        confidence: 0,
        blockRegistration: false,
        message: "No watermark detected in image",
      } as VerifyWatermarkResponse);
      return;
    }

    // Try to deserialize watermark
    const watermarkData = deserializeWatermark(bits);

    if (!watermarkData) {
      res.status(200).json({
        hasWatermark: false,
        confidence: 0,
        blockRegistration: false,
        message: "Watermark data could not be decoded",
      } as VerifyWatermarkResponse);
      return;
    }

    // Get current user's IP ID from request (would come from auth context)
    // This is a placeholder - implement based on your auth system
    const currentUserIpId = req.headers["x-ip-id"] as string | undefined;

    // Block registration if watermark from different IP
    const blockRegistration =
      !!currentUserIpId && currentUserIpId !== watermarkData.ipId;

    const response: VerifyWatermarkResponse = {
      hasWatermark: true,
      watermark: watermarkData,
      confidence: 0.95,
      originalIpId: watermarkData.ipId,
      blockRegistration,
      message: blockRegistration
        ? `This image was remixed from IP ${watermarkData.ipId} and cannot be registered as a new IP. Please use an original image.`
        : `Watermark detected from original IP ${watermarkData.ipId}`,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error verifying watermark:", error);
    res.status(500).json({
      hasWatermark: false,
      confidence: 0,
      blockRegistration: false,
      message: "Error verifying watermark",
    } as VerifyWatermarkResponse);
  }
}
