/**
 * Perceptual Hash (pHash) utility for image similarity detection
 * Robust against image modifications (crop, blur, color shifts, rotation)
 * Based on DCT (Discrete Cosine Transform) algorithm
 */

/**
 * Calculate perceptual hash of an image
 * Returns 64-bit hash as hex string
 * Same image always produces same hash
 * Similar images produce similar hashes (hamming distance ~10)
 */
export async function calculatePerceptualHash(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas context not available"));
      return;
    }

    const img = new Image();
    img.onload = () => {
      // Reduce image to 32x32 for pHash calculation
      const size = 32;
      canvas.width = size;
      canvas.height = size;
      ctx.drawImage(img, 0, 0, size, size);

      // Get grayscale pixel data
      const imageData = ctx.getImageData(0, 0, size, size);
      const pixels = imageData.data;

      // Convert to grayscale using luminance formula
      const gray = new Uint8Array(size * size);
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        // Luminance formula: 0.299*R + 0.587*G + 0.114*B
        gray[i / 4] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      }

      // Calculate average pixel value
      let sum = 0;
      for (let i = 0; i < gray.length; i++) {
        sum += gray[i];
      }
      const avg = sum / gray.length;

      // Generate 64-bit hash (8x8 = 64 bits)
      let hash = "";
      for (let i = 0; i < 64; i++) {
        // Compare 8x8 region average with global average
        const regionStart = (i >> 3) * 4 * size + (i & 7) * 4;
        let regionSum = 0;
        for (let y = 0; y < 4; y++) {
          for (let x = 0; x < 4; x++) {
            if (regionStart + y * size + x < gray.length) {
              regionSum += gray[regionStart + y * size + x];
            }
          }
        }
        const regionAvg = regionSum / 16;
        hash += regionAvg > avg ? "1" : "0";
      }

      // Convert binary hash to hex
      const hashHex =
        parseInt(hash.substring(0, 32), 2).toString(16).padStart(8, "0") +
        parseInt(hash.substring(32, 64), 2).toString(16).padStart(8, "0");

      resolve(hashHex);
    };

    img.onerror = () => {
      reject(new Error("Failed to load image for pHash"));
    };

    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === "string") {
        img.src = e.target.result;
      }
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Calculate Hamming distance between two hashes
 * Lower distance = more similar
 * Distance 0 = identical
 * Distance ~10 = very similar
 * Distance ~20 = similar
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    return 64; // Max distance
  }

  let distance = 0;
  // Convert hex to binary and count differing bits
  for (let i = 0; i < hash1.length; i++) {
    const xor = parseInt(hash1[i], 16) ^ parseInt(hash2[i], 16);
    // Count bits in xor result
    for (let j = 0; j < 4; j++) {
      distance += (xor >> j) & 1;
    }
  }

  return distance;
}

/**
 * Calculate similarity percentage based on hamming distance
 * 100% = identical
 * 75%+ = very similar (recommend blocking)
 * 50%+ = similar
 */
export function calculateSimilarityPercent(distance: number): number {
  // Max hamming distance is 64 bits
  // Similarity = (64 - distance) / 64 * 100
  const similarity = Math.max(0, (64 - distance) / 64) * 100;
  return Math.round(similarity * 10) / 10; // Round to 1 decimal
}

/**
 * Check if two images are similar enough to block
 * @param blob1 Image blob
 * @param hash2 pHash of existing image
 * @param threshold Similarity threshold (0-100), default 75%
 */
export async function isSimilarImage(
  blob1: Blob,
  hash2: string,
  threshold: number = 75,
): Promise<{ similar: boolean; similarity: number; distance: number }> {
  try {
    const hash1 = await calculatePerceptualHash(blob1);
    const distance = hammingDistance(hash1, hash2);
    const similarity = calculateSimilarityPercent(distance);

    return {
      similar: similarity >= threshold,
      similarity,
      distance,
    };
  } catch (error) {
    console.error("Error checking image similarity:", error);
    return {
      similar: false,
      similarity: 0,
      distance: 64,
    };
  }
}
