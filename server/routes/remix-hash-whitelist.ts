import type { Request, Response } from "express";
import {
  addHashToWhitelist,
  checkHashInWhitelist,
  getAllWhitelistHashes,
} from "../utils/remix-hash-whitelist.js";

/**
 * Add hash to remix whitelist
 * POST /api/add-remix-hash
 * Body: {
 *   hash: string (SHA256 of pure image),
 *   ipId?: string,
 *   title?: string,
 *   pHash?: string,
 *   visionDescription?: string
 * }
 */
export async function handleAddRemixHash(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const {
      hash,
      pHash,
      visionDescription,
      ipId = "unknown",
      title = "Remix Image",
    } = req.body;

    if (!hash || typeof hash !== "string") {
      res.status(400).json({ error: "Hash is required" });
      return;
    }

    if (hash.length !== 64) {
      // SHA256 produces 64 hex characters
      res
        .status(400)
        .json({ error: "Invalid hash format. SHA256 expected (64 chars)" });
      return;
    }

    // Add to whitelist with separated metadata
    const metadata = {
      ipId,
      title,
      timestamp: Date.now(),
      pHash,
      visionDescription,
    };

    await addHashToWhitelist(hash.toLowerCase(), metadata);

    res.status(200).json({
      success: true,
      message: "Hash added to remix whitelist",
      hash: hash.toLowerCase(),
      metadata,
    });
  } catch (error) {
    console.error("Error adding hash to whitelist:", error);
    res.status(500).json({
      error: "Failed to add hash to whitelist",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Check if hash exists in remix whitelist
 * POST /api/check-remix-hash
 * Body: { hash: string }
 */
export async function handleCheckRemixHash(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { hash } = req.body;

    if (!hash || typeof hash !== "string") {
      res.status(400).json({ error: "Hash is required" });
      return;
    }

    // Check whitelist
    const entry = await checkHashInWhitelist(hash.toLowerCase());

    if (entry) {
      res.status(200).json({
        found: true,
        message: `IP ${entry.ipId} sudah terdaftar (${entry.title})`,
        ipId: entry.ipId,
        title: entry.title,
        timestamp: entry.timestamp,
      });
    } else {
      res.status(200).json({
        found: false,
        message: "Hash not found in whitelist",
      });
    }
  } catch (error) {
    console.error("Error checking remix hash:", error);
    res.status(500).json({
      error: "Failed to check remix hash",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Admin endpoint: Get all hashes in whitelist
 * GET /api/_admin/remix-hashes
 */
export async function handleGetRemixHashes(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const hashes = await getAllWhitelistHashes();

    res.status(200).json({
      count: hashes.length,
      hashes,
    });
  } catch (error) {
    console.error("Error getting remix hashes:", error);
    res.status(500).json({
      error: "Failed to get remix hashes",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
