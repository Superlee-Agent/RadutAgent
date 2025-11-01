/**
 * Vision API utility for extracting image descriptions
 * Uses OpenAI Vision to understand image content semantically
 */

export interface VisionDescription {
  description: string;
  timestamp: number;
  success: boolean;
}

/**
 * Get image description from OpenAI Vision API
 * Extracts semantic features for similarity detection
 */
export async function getImageVisionDescription(
  blob: Blob,
): Promise<VisionDescription | null> {
  try {
    // Convert blob to base64
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64 = btoa(binary);

    // Call server endpoint to get vision description
    // Server has access to OpenAI API key
    const response = await fetch("/api/analyze-image-vision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: base64,
      }),
    });

    if (!response.ok) {
      console.warn("Vision API call failed:", response.status);
      return null;
    }

    const data = (await response.json()) as any;

    if (data.description) {
      return {
        description: data.description,
        timestamp: Date.now(),
        success: true,
      };
    }

    return null;
  } catch (error) {
    console.error("Error getting vision description:", error);
    return null;
  }
}
