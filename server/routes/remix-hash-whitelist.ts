import {
  addHashToWhitelist,
  checkHashInWhitelist,
  getAllWhitelistHashes,
  getAllWhitelistEntries,
  clearWhitelist,
  deleteHashFromWhitelist,
} from "../utils/remix-hash-whitelist.js";

/**
 * Fetch full asset details from Story API (simulate clicking Details button)
 * This gets all the information shown in the IP Asset Details modal popup
 */
async function fetchFullAssetDetailsFromApi(ipId: string): Promise<any> {
  try {
    const apiKey = process.env.STORY_API_KEY;
    if (!apiKey) {
      console.warn(
        "[Whitelist] STORY_API_KEY not configured, cannot fetch full details",
      );
      return null;
    }

    console.log("[Whitelist] 🔍 Fetching complete asset details for:", ipId);

    const response = await fetch("https://api.storyapis.com/api/v4/assets", {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        includeLicenses: true,
        where: {
          ipIds: [ipId],
        },
        pagination: {
          limit: 1,
          offset: 0,
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(
        `[Whitelist] Failed to fetch asset details: ${response.status}`,
      );
      return null;
    }

    const data = await response.json();
    if (!Array.isArray(data.data) || data.data.length === 0) {
      console.warn("[Whitelist] No asset data returned from API");
      return null;
    }

    const fullAsset = data.data[0];
    console.log(
      "[Whitelist] ✅ Full asset details fetched (simulating Details click):",
      {
        ipId: fullAsset.ipId,
        hasLicenses: !!fullAsset.licenses?.length,
        hasOwnerAddress: !!fullAsset.owner,
        hasMediaType: !!fullAsset.mediaType,
        totalFields: Object.keys(fullAsset).length,
      },
    );

    return fullAsset;
  } catch (error) {
    console.warn("[Whitelist] Error fetching full asset details:", error);
    return null;
  }
}

/**
 * Add hash to remix whitelist
 * POST /api/add-remix-hash
 * Body: {
 *   hash: string (SHA256 of pure image),
 *   ipId?: string,
 *   [all fields from client - from expanded view]
 * }
 *
 * The backend automatically fetches the complete Details information
 * (simulating a click on the Details button) to capture everything
 * shown in the IP Asset Details modal without user interaction.
 */
export async function handleAddRemixHash(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { hash, ipId, ...clientData } = req.body;

    console.log("[Whitelist] 📥 Received add-remix-hash request:", {
      hash: hash?.substring(0, 16),
      ipId,
      clientDataKeys: Object.keys(clientData),
    });

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

    // Start with client-provided data
    let metadata = {
      timestamp: Date.now(),
      ipId,
      ...clientData,
    };

    // In background, fetch complete asset details (simulate Details button click)
    // This gets: full licenses, owner info, media type, description, parent IPs, etc.
    console.log("[Whitelist] 🔄 Fetching full Details modal data from Story API...");
    let fullAssetDetails = null;
    if (ipId) {
      console.log("[Whitelist] 🔍 About to fetch full asset details for ipId:", ipId);
      fullAssetDetails = await fetchFullAssetDetailsFromApi(ipId);
      console.log("[Whitelist] ✅ Fetch complete. Got details:", !!fullAssetDetails);
    } else {
      console.log("[Whitelist] ⚠️ No ipId provided, skipping API fetch");
    }

    // Merge full details with client data
    // Full details fill gaps, client data takes precedence for what's already there
    if (fullAssetDetails) {
      console.log(
        "[Whitelist] 🔀 Merging complete asset details into metadata",
      );

      const detailsMetadata = {
        // Asset info
        title: fullAssetDetails.title || metadata.title,
        owner: fullAssetDetails.owner,
        ownerAddress: fullAssetDetails.owner || metadata.ownerAddress,
        mediaType: fullAssetDetails.mediaType || metadata.mediaType,

        // Derivative info
        parentsCount: fullAssetDetails.parentsCount,
        isDerivative:
          (fullAssetDetails.parentsCount || 0) > 0 || metadata.isDerivative,

        // Licenses (complete from Details modal)
        licenses: fullAssetDetails.licenses || metadata.licenses,
        licenseTermsIds:
          fullAssetDetails.licenseTermsIds || metadata.licenseTermsIds,
        licenseTemplates:
          fullAssetDetails.licenseTemplates || metadata.licenseTemplates,
        licenseVisibility:
          fullAssetDetails.licenseVisibility || metadata.licenseVisibility,

        // Royalty configuration
        royaltyContext:
          fullAssetDetails.royaltyContext || metadata.royaltyContext,
        maxMintingFee: fullAssetDetails.maxMintingFee || metadata.maxMintingFee,
        maxRts: fullAssetDetails.maxRts || metadata.maxRts,
        maxRevenueShare:
          fullAssetDetails.maxRevenueShare || metadata.maxRevenueShare,

        // Parent/derivative details
        parentIpIds: fullAssetDetails.parentIpIds || metadata.parentIpIds,
        parentIpDetails:
          fullAssetDetails.parentIpDetails || metadata.parentIpDetails,

        // Additional details
        description: fullAssetDetails.description || metadata.description,
        ipaMetadataUri:
          fullAssetDetails.ipaMetadataUri || metadata.ipaMetadataUri,

        // Spread all other fields from full asset
        ...Object.fromEntries(
          Object.entries(fullAssetDetails).filter(
            ([key]) =>
              ![
                "ipId",
                "title",
                "owner",
                "ownerAddress",
                "mediaType",
                "parentsCount",
                "isDerivative",
                "licenses",
                "licenseTermsIds",
                "licenseTemplates",
                "licenseVisibility",
                "royaltyContext",
                "maxMintingFee",
                "maxRts",
                "maxRevenueShare",
                "parentIpIds",
                "parentIpDetails",
                "description",
                "ipaMetadataUri",
              ].includes(key),
          ),
        ),
      };

      // Merge: full details + client data (client takes precedence)
      metadata = {
        ...detailsMetadata,
        ...metadata,
        timestamp: metadata.timestamp,
      };
    }

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

    // Debug log showing all captured fields (both from client and fetched Details)
    const nonEmptyFields = Object.entries(metadata).filter(
      ([_, value]) => value !== undefined && value !== null && value !== "",
    );

    console.log(
      "📥 [Whitelist] Storing complete Details modal data (auto-fetched):",
      {
        hash: hash.substring(0, 16) + "...",
        ipId,
        totalFields: Object.keys(metadata).length,
        capturedFields: nonEmptyFields.map(([k]) => k).sort(),
        detailsFetched: fullAssetDetails ? "✅ yes" : "❌ no",
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
      message: fullAssetDetails
        ? "Hash added with complete Details modal data (auto-fetched)"
        : "Hash added with available data",
      hash: hash.toLowerCase(),
      metadata,
      capturedFieldCount: Object.keys(metadata).length,
      detailsFetched: !!fullAssetDetails,
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
