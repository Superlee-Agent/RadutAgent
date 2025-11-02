import {
  addHashToWhitelist,
  checkHashInWhitelist,
  getAllWhitelistHashes,
  getAllWhitelistEntries,
  clearWhitelist,
  deleteHashFromWhitelist,
} from "../utils/remix-hash-whitelist.js";

/**
 * Add hash to remix whitelist
 * POST /api/add-remix-hash
 * Body: {
 *   hash: string (SHA256 of pure image),
 *   [all fields from IP Asset Details modal - already fetched during search]
 * }
 *
 * Note: The data is already fetched during the IP search phase.
 * This endpoint receives the complete asset data from the frontend modal
 * and stores it without making additional API calls.
 */
export async function handleAddRemixHash(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { hash, ...allMetadata } = req.body;

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

    // Prepare metadata with timestamp
    const metadata = {
      timestamp: Date.now(),
      ...allMetadata,
    };

    // Clean metadata: remove undefined/null values
    Object.keys(metadata).forEach((key) => {
      if (
        metadata[key] === undefined ||
        metadata[key] === null ||
        metadata[key] === ""
      ) {
        delete metadata[key];
      }
    });

    // Debug log showing all captured fields from IP Asset Details modal
    const nonEmptyFields = Object.entries(metadata).filter(
      ([_, value]) => value !== undefined && value !== null && value !== "",
    );

    console.log(
      "📥 [Whitelist] Storing all raw data from IP Asset Details modal:",
      {
        hash: hash.substring(0, 16) + "...",
        ipId: metadata.ipId,
        totalFields: Object.keys(metadata).length,
        capturedFields: nonEmptyFields.map(([k]) => k).sort(),
        summary: {
          hasTitle: !!metadata.title,
          hasOwnerAddress: !!metadata.ownerAddress,
          hasMediaType: !!metadata.mediaType,
          hasScore: metadata.score !== undefined,
          licenseCount: metadata.licenses?.length || 0,
          hasDescription: !!metadata.description,
          hasParentIpDetails: !!metadata.parentIpDetails,
          isDerivative: metadata.isDerivative,
          parentsCount: metadata.parentsCount,
        },
      },
    );

    await addHashToWhitelist(hash.toLowerCase(), metadata);

    res.status(200).json({
      success: true,
      message: "Hash added to whitelist with all modal data",
      hash: hash.toLowerCase(),
      metadata,
      capturedFieldCount: Object.keys(metadata).length,
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
      // Get derivatives allowed status from licenses
      const licenses = entry.metadata?.licenses || [];
      // If licenses exist, check derivativesAllowed
      // If no licenses (legacy data), assume allow remix
      const derivativesAllowed =
        licenses.length > 0
          ? licenses[0].terms?.derivativesAllowed === true
          : true; // Legacy entries without license info assume remix allowed

      return res.json({
        found: true,
        type: "exact",
        metadata: entry.metadata,
        derivativesAllowed,
      });
    }

    // Check perceptual hash similarity if pHash provided
    if (pHash) {
      console.log(
        `[Remix Hash] No exact match, checking perceptual similarity...`,
      );
      const allEntries = await getAllWhitelistEntries();

      // Find most similar entry
      let mostSimilar = null;
      let maxSimilarity = 0;

      for (const whitelistEntry of allEntries) {
        const whitelistPHash = whitelistEntry.metadata?.pHash;
        if (!whitelistPHash) continue;

        const distance = hammingDistance(pHash, whitelistPHash);
        // Calculate similarity as percentage (64 is max distance for 64-bit hash)
        const similarity = ((64 - distance) / 64) * 100;

        if (similarity >= 70 && similarity > maxSimilarity) {
          maxSimilarity = similarity;
          mostSimilar = whitelistEntry;
        }
      }

      if (mostSimilar) {
        console.log(
          `[Remix Hash] PHASH MATCH (${maxSimilarity.toFixed(1)}%): ${mostSimilar.metadata?.title || mostSimilar.metadata?.ipId}`,
        );
        return res.json({
          found: true,
          type: "phash",
          similarity: maxSimilarity,
          metadata: mostSimilar.metadata,
        });
      }
    }

    console.log("[Remix Hash] No match found");
    res.json({ found: false });
  } catch (error) {
    console.error("[Remix Hash] Error checking hash:", error);
    res.status(500).json({
      error: "Failed to check hash",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Get all remix hashes (admin only)
 * GET /api/_admin/remix-hashes
 */
export async function handleGetRemixHashes(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const hashes = await getAllWhitelistHashes();
    res.json({ hashes, total: hashes.length });
  } catch (error) {
    console.error("Error getting remix hashes:", error);
    res.status(500).json({ error: "Failed to get remix hashes" });
  }
}

/**
 * Get all remix hashes with full metadata (admin only)
 * GET /api/_admin/remix-hashes-full
 */
export async function handleGetRemixHashesFull(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const entries = await getAllWhitelistEntries();
    res.status(200).json({ entries, lastUpdated: Date.now() });
  } catch (error) {
    console.error("Error getting whitelist entries:", error);
    res.status(500).json({ error: "Failed to get whitelist entries" });
  }
}

/**
 * Delete hash from whitelist (admin only)
 * POST /api/_admin/delete-remix-hash
 * Body: { hash: string }
 */
export async function handleDeleteRemixHash(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { hash } = req.body;
    if (!hash) {
      res.status(400).json({ error: "Hash required" });
      return;
    }

    await deleteHashFromWhitelist(hash);
    res.status(200).json({ success: true, message: "Hash deleted" });
  } catch (error) {
    console.error("Error deleting hash:", error);
    res.status(500).json({ error: "Failed to delete hash" });
  }
}

/**
 * Clear all hashes from whitelist (admin only)
 * POST /api/_admin/clear-remix-hashes
 */
export async function handleClearRemixHashes(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    await clearWhitelist();
    res.status(200).json({ success: true, message: "Whitelist cleared" });
  } catch (error) {
    console.error("Error clearing whitelist:", error);
    res.status(500).json({ error: "Failed to clear whitelist" });
  }
}
