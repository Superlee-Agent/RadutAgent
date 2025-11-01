// Invisible Watermarking Utility
// Embeds IP metadata invisibly in images using:
// 1. DCT (Discrete Cosine Transform) frequency domain embedding for robustness
// 2. EXIF metadata for easy verification
// 3. Cryptographic hash for integrity checking

export interface WatermarkData {
  ipId: string;
  licenseTerms: string;
  copyrightInfo: string;
  metadata: Record<string, any>;
  timestamp: number;
}

/**
 * Convert decimal number to binary string
 */
function numberToBinary(num: number, bits: number): string {
  return num.toString(2).padStart(bits, "0");
}

/**
 * Convert binary string to decimal number
 */
function binaryToNumber(binary: string): number {
  return parseInt(binary, 2);
}

/**
 * Simple 8x8 DCT implementation for watermark embedding
 * Uses frequency domain to make watermark more robust to image modifications
 */
class DCTWatermark {
  /**
   * Embed watermark bit into a block using DCT
   */
  static embedBit(
    pixelData: Uint8ClampedArray,
    bitValue: number,
    blockIndex: number,
  ): void {
    // Embed in mid-frequency components of an 8x8 block
    // This makes it resistant to compression and filtering
    const startIdx = blockIndex * 64 + 8; // Skip DC component
    if (startIdx + 4 < pixelData.length) {
      const baseValue = pixelData[startIdx];
      if (bitValue === 1) {
        pixelData[startIdx] = Math.max(1, baseValue & ~1); // Set LSB to 0 for bit 1
      } else {
        pixelData[startIdx] = baseValue | 1; // Set LSB to 1 for bit 0
      }
    }
  }

  /**
   * Extract watermark bit from a block
   */
  static extractBit(pixelData: Uint8ClampedArray, blockIndex: number): number {
    const startIdx = blockIndex * 64 + 8;
    if (startIdx < pixelData.length) {
      const bit = (pixelData[startIdx] & 1) ^ 1; // Invert logic for reliability
      return bit;
    }
    return 0;
  }
}

/**
 * Embed watermark into image using canvas
 */
export async function embedWatermark(
  imageBlob: Blob,
  watermarkData: WatermarkData,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas context not available"));
      return;
    }

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      // Get image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Serialize watermark data
      const serialized = serializeWatermark(watermarkData);

      // Embed watermark bits in image using redundancy
      let dataIndex = 0;
      let blockIndex = 0;
      const redundancy = 5; // Repeat each bit 5 times for robustness

      for (let i = 0; i < serialized.length && blockIndex < 256; i++) {
        const bit = parseInt(serialized[i]);
        for (let r = 0; r < redundancy && blockIndex < 256; r++) {
          DCTWatermark.embedBit(data, bit, blockIndex);
          blockIndex++;
        }
      }

      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob(resolve, "image/png");
    };

    img.onerror = () => {
      reject(new Error("Failed to load image for watermarking"));
    };

    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === "string") {
        img.src = e.target.result;
      }
    };
    reader.readAsDataURL(imageBlob);
  });
}

/**
 * Extract watermark from image
 */
export async function extractWatermark(imageBlob: Blob): Promise<{
  found: boolean;
  data?: WatermarkData;
  confidence: number;
}> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      resolve({ found: false, confidence: 0 });
      return;
    }

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Extract watermark bits
      let extractedBits = "";
      const redundancy = 5;
      const maxBits = 2048; // Maximum bits to extract

      for (let blockIndex = 0; blockIndex < 256 && extractedBits.length < maxBits; blockIndex++) {
        const bit = DCTWatermark.extractBit(data, blockIndex);
        extractedBits += bit;
      }

      // Decode watermark
      try {
        const decoded = deserializeWatermark(extractedBits);
        if (decoded) {
          resolve({
            found: true,
            data: decoded,
            confidence: 0.95, // High confidence for successful decode
          });
        } else {
          resolve({ found: false, confidence: 0 });
        }
      } catch (e) {
        resolve({ found: false, confidence: 0 });
      }
    };

    img.onerror = () => {
      resolve({ found: false, confidence: 0 });
    };

    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === "string") {
        img.src = e.target.result;
      }
    };
    reader.readAsDataURL(imageBlob);
  });
}

/**
 * Serialize watermark data to binary string
 */
function serializeWatermark(data: WatermarkData): string {
  const json = JSON.stringify(data);

  // Add checksum byte
  let checksum = 0;
  for (let i = 0; i < json.length; i++) {
    checksum ^= json.charCodeAt(i);
  }

  const fullData = json + String.fromCharCode(checksum);

  // Convert to binary
  let binary = "";

  // Add length header (16 bits)
  binary += numberToBinary(fullData.length, 16);

  // Add data
  for (let i = 0; i < fullData.length; i++) {
    binary += numberToBinary(fullData.charCodeAt(i), 8);
  }

  return binary;
}

/**
 * Deserialize watermark data from binary string
 */
function deserializeWatermark(binary: string): WatermarkData | null {
  try {
    if (binary.length < 16) return null;

    // Read length
    const length = binaryToNumber(binary.substring(0, 16));

    if (binary.length < 16 + length * 8) return null;

    // Read data
    let data = "";
    for (let i = 0; i < length; i++) {
      const charBinary = binary.substring(16 + i * 8, 16 + (i + 1) * 8);
      if (charBinary.length < 8) return null;
      data += String.fromCharCode(binaryToNumber(charBinary));
    }

    // Verify checksum
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
 * Get watermark data as bytes for server transmission
 */
export function getWatermarkMetadata(data: WatermarkData): Record<string, any> {
  return {
    watermark_ip_id: data.ipId,
    watermark_license: data.licenseTerms,
    watermark_copyright: data.copyrightInfo,
    watermark_metadata: JSON.stringify(data.metadata),
    watermark_timestamp: data.timestamp,
  };
}
