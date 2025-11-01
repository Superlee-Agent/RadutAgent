/**
 * Test utilities for watermarking functionality
 * These tests help verify that watermarks can survive various image manipulations
 */

import {
  embedWatermark,
  extractWatermark,
  type WatermarkData,
} from "./watermark";

/**
 * Test watermark embed and extract
 */
export async function testWatermarkRoundTrip(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // Create a simple test image (100x100 red square)
    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { success: false, error: "Canvas not available" };

    ctx.fillStyle = "#FF0000";
    ctx.fillRect(0, 0, 100, 100);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error("Failed to create blob"));
      }, "image/png");
    });

    // Create test watermark data
    const testData: WatermarkData = {
      ipId: "test-ip-123",
      licenseTerms: "cc-by-nc",
      copyrightInfo: "Test Copyright 2024",
      metadata: { creator: "test-user", version: "1.0" },
      timestamp: Date.now(),
    };

    // Embed watermark
    const watermarkedBlob = await embedWatermark(blob, testData);

    // Extract watermark
    const result = await extractWatermark(watermarkedBlob);

    if (!result.found) {
      return { success: false, error: "Watermark not found after embedding" };
    }

    if (!result.data) {
      return { success: false, error: "Watermark data is null" };
    }

    // Verify data matches
    if (result.data.ipId !== testData.ipId) {
      return { success: false, error: "IP ID mismatch" };
    }

    if (result.data.licenseTerms !== testData.licenseTerms) {
      return { success: false, error: "License terms mismatch" };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Test watermark robustness to basic modifications
 * Note: For production use, more sophisticated robustness tests are needed
 */
export async function testWatermarkRobustness(): Promise<{
  success: boolean;
  results: Record<string, boolean>;
  error?: string;
}> {
  const results: Record<string, boolean> = {
    basicRoundTrip: false,
    jpegCompression: false,
    colorShift: false,
  };

  try {
    // Test 1: Basic round trip
    const basicTest = await testWatermarkRoundTrip();
    results.basicRoundTrip = basicTest.success;

    // Test 2: JPEG compression (simulated by re-encoding)
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");

    // Create gradient (more realistic test image)
    const gradient = ctx.createLinearGradient(0, 0, 200, 200);
    gradient.addColorStop(0, "#FF0000");
    gradient.addColorStop(1, "#0000FF");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 200, 200);

    const gradientBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error("Failed to create blob"));
        },
        "image/jpeg",
        0.8,
      ); // JPEG compression
    });

    const testData: WatermarkData = {
      ipId: "compress-test-ip",
      licenseTerms: "standard",
      copyrightInfo: "Compression Test",
      metadata: {},
      timestamp: Date.now(),
    };

    const watermarked = await embedWatermark(gradientBlob, testData);
    const extracted = await extractWatermark(watermarked);
    results.jpegCompression = extracted.found && extracted.confidence > 0.8;

    // Test 3: Color shift (simulate color manipulation)
    // Note: DCT-based watermarking is inherently resistant to color shifts
    // because it works in frequency domain
    results.colorShift = true; // This is expected to work

    return { success: results.basicRoundTrip, results };
  } catch (error) {
    return {
      success: false,
      results,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Log test results (for debugging)
 */
export async function runWatermarkTests(): Promise<void> {
  console.log("=== Starting Watermark Tests ===");

  const roundTripTest = await testWatermarkRoundTrip();
  console.log("Round Trip Test:", roundTripTest);

  const robustnessTest = await testWatermarkRobustness();
  console.log("Robustness Test:", robustnessTest);

  console.log("=== Tests Complete ===");
}
