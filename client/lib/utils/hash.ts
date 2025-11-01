/**
 * Cryptographic hash utilities for image verification
 */

/**
 * Calculate SHA256 hash of a Blob
 * Returns the hash as a hex string
 */
export async function calculateBlobHash(blob: Blob): Promise<string> {
  try {
    // Use Web Crypto API for SHA-256
    const arrayBuffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);

    // Convert to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return hashHex;
  } catch (error) {
    console.error("Failed to calculate hash:", error);
    throw new Error("Failed to calculate image hash");
  }
}

/**
 * Calculate hash of a File
 */
export async function calculateFileHash(file: File): Promise<string> {
  return calculateBlobHash(file);
}
