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
 *   visionDescription?: string,
 *   ownerAddress?: string,
 *   mediaType?: string,
 *   score?: number,
 *   parentIpIds?: string[],
 *   licenseTermsIds?: string[],
 *   licenseTemplates?: string[],
 *   royaltyContext?: string,
 *   maxMintingFee?: string,
 *   maxRts?: string,
 *   maxRevenueShare?: number,
 *   licenseVisibility?: string,
 *   licenses?: any[],
 *   isDerivative?: boolean,
 *   parentsCount?: number
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
      ownerAddress,
      mediaType,
      score,
      parentIpIds,
      licenseTermsIds,
      licenseTemplates,
      royaltyContext,
      maxMintingFee,
      maxRts,
      maxRevenueShare,
      licenseVisibility,
      licenses,
      isDerivative,
      parentsCount,
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

    // Add to whitelist with separated metadata (including all parent IP details)
    const metadata = {
      ipId,
      title,
      timestamp: Date.now(),
      pHash,
      visionDescription,
      ownerAddress,
      mediaType,
      score,
      parentIpIds,
      licenseTermsIds,
      licenseTemplates,
      royaltyContext,
      maxMintingFee,
      maxRts,
      maxRevenueShare,
      licenseVisibility,
      licenses,
      isDerivative,
      parentsCount,
    };

    await addHashToWhitelist(hash.toLowerCase(), metadata);

    res.status(200).json({
      success: true,
      message: "Hash added to remix whitelist with parent IP details",
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
 * Calculate hamming distance between two pHashes
 * Used for perceptual hash similarity comparison
 */
function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    return 64; // Max distance for 64-bit hash
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
 * Check if hash exists in remix whitelist
 * POST /api/check-remix-hash
 * Body: { hash: string, pHash?: string }
 */
export async function handleCheckRemixHash(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { hash, pHash } = req.body;
    console.log(
      `[Remix Hash] Check request - hash: ${hash?.substring(0, 16)}..., pHash: ${pHash}`,
    );

    if (!hash || typeof hash !== "string") {
      console.log("[Remix Hash] Hash invalid/missing");
      res.status(400).json({ error: "Hash is required" });
      return;
    }

    // Check exact hash match first
    const entry = await checkHashInWhitelist(hash.toLowerCase());

    if (entry) {
      console.log(
        `[Remix Hash] EXACT MATCH: ${entry.metadata?.title || entry.title}`,
      );
      res.status(200).json({
        found: true,
        message: `IP ${entry.metadata?.ipId || entry.ipId} sudah terdaftar (${entry.metadata?.title || entry.title})`,
        ipId: entry.metadata?.ipId || entry.ipId,
        title: entry.metadata?.title || entry.title,
        timestamp: entry.metadata?.timestamp || entry.timestamp,
        // Parent IP Details
        parentIpIds: entry.metadata?.parentIpIds,
        licenseTermsIds: entry.metadata?.licenseTermsIds,
        licenseTemplates: entry.metadata?.licenseTemplates,
        // License Configuration
        royaltyContext: entry.metadata?.royaltyContext,
        maxMintingFee: entry.metadata?.maxMintingFee,
        maxRts: entry.metadata?.maxRts,
        maxRevenueShare: entry.metadata?.maxRevenueShare,
        licenseVisibility: entry.metadata?.licenseVisibility,
        // Derivative Status
        isDerivative: entry.metadata?.isDerivative,
        parentsCount: entry.metadata?.parentsCount,
      });
      return;
    }

    // If no exact match and pHash provided, check pHash similarity
    if (pHash) {
      console.log(
        `[Remix Hash] Exact hash not found, checking pHash: ${pHash}`,
      );

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

        // Check pHash similarity using hamming distance
        console.log(
          `[Remix Hash] Checking ${whitelist.entries?.length || 0} entries for pHash similarity...`,
        );
        for (const entry of whitelist.entries || []) {
          const storedPHash = entry.metadata?.pHash || entry.pHash;
          if (storedPHash) {
            const distance = hammingDistance(pHash, storedPHash);
            const similarity = Math.round(((64 - distance) / 64) * 100);
            console.log(
              `[Remix Hash]   Comparing: ${pHash} vs ${storedPHash} - distance: ${distance}, similarity: ${similarity}%`,
            );

            // If similarity >= 75%, consider it a match
            if (similarity >= 75) {
              console.log(
                `[Remix Hash] pHash MATCH found! (${similarity}% similar) IP: ${entry.metadata?.ipId || entry.ipId}`,
              );
              res.status(200).json({
                found: true,
                message: `IP ${entry.metadata?.ipId || entry.ipId} sudah terdaftar (${entry.metadata?.title || entry.title})`,
                ipId: entry.metadata?.ipId || entry.ipId,
                title: entry.metadata?.title || entry.title,
                timestamp: entry.metadata?.timestamp || entry.timestamp,
                matchType: "pHash",
                similarity,
                // Parent IP Details
                parentIpIds: entry.metadata?.parentIpIds,
                licenseTermsIds: entry.metadata?.licenseTermsIds,
                licenseTemplates: entry.metadata?.licenseTemplates,
                // License Configuration
                royaltyContext: entry.metadata?.royaltyContext,
                maxMintingFee: entry.metadata?.maxMintingFee,
                maxRts: entry.metadata?.maxRts,
                maxRevenueShare: entry.metadata?.maxRevenueShare,
                licenseVisibility: entry.metadata?.licenseVisibility,
                // Derivative Status
                isDerivative: entry.metadata?.isDerivative,
                parentsCount: entry.metadata?.parentsCount,
              });
              return;
            }
          }
        }
      } catch (err) {
        console.warn(
          "[Remix Hash] Error reading whitelist for pHash check:",
          err,
        );
      }
    }

    // No match found
    res.status(200).json({
      found: false,
      message: "Hash not found in whitelist",
    });
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
