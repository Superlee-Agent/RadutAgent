import type { Request, Response } from "express";
import {
  addHashToWhitelist,
  checkHashInWhitelist,
  getAllWhitelistHashes,
  getAllWhitelistEntries,
  clearWhitelist,
  deleteHashFromWhitelist,
} from "../utils/remix-hash-whitelist.js";

/**
 * Fetch full asset details from Story API
 * This captures all information from the IP Asset Details modal
 */
async function fetchFullAssetDetailsFromApi(ipId: string): Promise<any> {
  try {
    const apiKey = process.env.STORY_API_KEY;
    if (!apiKey) {
      console.warn(
        "[Whitelist] STORY_API_KEY not configured, skipping full asset fetch"
      );
      return null;
    }

    console.log("[Whitelist] Fetching full asset details from API for:", ipId);

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
        `[Whitelist] Failed to fetch asset details: ${response.status}`
      );
      return null;
    }

    const data = await response.json();
    if (!Array.isArray(data.data) || data.data.length === 0) {
      console.warn("[Whitelist] No asset data returned from API");
      return null;
    }

    const fullAsset = data.data[0];
    console.log("[Whitelist] ✅ Full asset details fetched successfully:", {
      ipId: fullAsset.ipId,
      hasLicenses: !!fullAsset.licenses?.length,
      hasOwner: !!fullAsset.owner,
      hasMediaType: !!fullAsset.mediaType,
    });

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
 *   title?: string,
 *   pHash?: string,
 *   visionDescription?: string,
 *   [any other fields from client]
 * }
 *
 * The backend will ALSO fetch full asset details from Story API in parallel
 * to ensure ALL information from the IP Asset Details modal is captured
 */
export async function handleAddRemixHash(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { hash, ipId, ...clientMetadata } = req.body;

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

    // Start with client-provided metadata
    let metadata = {
      timestamp: Date.now(),
      ipId,
      ...clientMetadata,
    };

    // In parallel, fetch full asset details from Story API if ipId provided
    let fullAssetDetails = null;
    if (ipId) {
      fullAssetDetails = await fetchFullAssetDetailsFromApi(ipId);
    }

    // Merge full asset details into metadata
    // Client-provided data takes precedence, but add any missing fields from API
    if (fullAssetDetails) {
      console.log("[Whitelist] Merging full asset details into metadata");

      // Extract all relevant fields from full asset
      const apiMetadata = {
        // Basic info
        title: fullAssetDetails.title || fullAssetDetails.name,
        owner: fullAssetDetails.owner,
        ownerAddress:
          fullAssetDetails.owner ||
          clientMetadata.ownerAddress,
        mediaType:
          fullAssetDetails.mediaType || clientMetadata.mediaType,
        parentsCount: fullAssetDetails.parentsCount,
        isDerivative:
          (fullAssetDetails.parentsCount || 0) > 0 ||
          clientMetadata.isDerivative,

        // Licenses (comprehensive from Details modal)
        licenses: fullAssetDetails.licenses || clientMetadata.licenses,
        licenseTermsIds:
          fullAssetDetails.licenseTermsIds || clientMetadata.licenseTermsIds,
        licenseTemplates:
          fullAssetDetails.licenseTemplates ||
          clientMetadata.licenseTemplates,
        licenseVisibility:
          fullAssetDetails.licenseVisibility ||
          clientMetadata.licenseVisibility,

        // Royalty config
        royaltyContext:
          fullAssetDetails.royaltyContext || clientMetadata.royaltyContext,
        maxMintingFee:
          fullAssetDetails.maxMintingFee || clientMetadata.maxMintingFee,
        maxRts: fullAssetDetails.maxRts || clientMetadata.maxRts,
        maxRevenueShare:
          fullAssetDetails.maxRevenueShare || clientMetadata.maxRevenueShare,

        // Parent/derivative info
        parentIpIds:
          fullAssetDetails.parentIpIds || clientMetadata.parentIpIds,
        parentIpDetails:
          fullAssetDetails.parentIpDetails || clientMetadata.parentIpDetails,

        // Description and other details
        description:
          fullAssetDetails.description || clientMetadata.description,
        ipaMetadataUri:
          fullAssetDetails.ipaMetadataUri || clientMetadata.ipaMetadataUri,

        // Store raw full asset for reference
        fullAssetData: fullAssetDetails,
      };

      // Merge: client data takes precedence, API fills gaps
      metadata = {
        ...apiMetadata,
        ...clientMetadata,
        timestamp: metadata.timestamp,
      };
    }

    // Clean metadata: remove undefined/null values and empty objects
    Object.keys(metadata).forEach((key) => {
      if (
        metadata[key] === undefined ||
        metadata[key] === null ||
        metadata[key] === ""
      ) {
        delete metadata[key];
      }
    });

    // Debug log showing all captured fields (both from client and API)
    const nonEmptyFields = Object.entries(metadata).filter(
      ([_, value]) => value !== undefined && value !== null && value !== "",
    );

    console.log(
      "📥 [Whitelist] Storing complete asset data with metadata from client + API:",
      {
        hash: hash.substring(0, 16) + "...",
        ipId,
        sourceData: {
          fromClient: Object.keys(clientMetadata),
          fromApi: fullAssetDetails
            ? Object.keys(fullAssetDetails).slice(0, 15)
            : [],
        },
        totalFields: Object.keys(metadata).length,
        capturedFields: nonEmptyFields.map(([k]) => k).sort(),
        summary: {
          hasLicenses: !!metadata.licenses?.length,
          licenseCount: metadata.licenses?.length || 0,
          hasOwnerAddress: !!metadata.ownerAddress,
          hasDescription: !!metadata.description,
          hasParentIpDetails: !!metadata.parentIpDetails,
          isDerivative: metadata.isDerivative,
          parentsCount: metadata.parentsCount,
        },
      }
    );

    await addHashToWhitelist(hash.toLowerCase(), metadata);

    res.status(200).json({
      success: true,
      message: "Hash added to whitelist with complete asset details from API",
      hash: hash.toLowerCase(),
      metadata,
      sources: {
        clientProvidedFields: Object.keys(clientMetadata),
        apiEnrichedFields: fullAssetDetails
          ? Object.keys(fullAssetDetails)
          : [],
      },
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
        // License terms
        licenses: entry.metadata?.licenses,
        derivativesAllowed: derivativesAllowed,
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
              // Get derivatives allowed status from licenses
              const licenses = entry.metadata?.licenses || [];
              // If licenses exist, check derivativesAllowed
              // If no licenses (legacy data), assume allow remix
              const derivativesAllowed =
                licenses.length > 0
                  ? licenses[0].terms?.derivativesAllowed === true
                  : true; // Legacy entries without license info assume remix allowed

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
                // License terms
                licenses: entry.metadata?.licenses,
                derivativesAllowed: derivativesAllowed,
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

/**
 * Admin endpoint: Clear all hashes from whitelist
 * POST /api/_admin/clear-remix-hashes
 */
export async function handleClearRemixHashes(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    await clearWhitelist();

    res.status(200).json({
      success: true,
      message: "All hashes cleared from whitelist",
    });
  } catch (error) {
    console.error("Error clearing remix hashes:", error);
    res.status(500).json({
      error: "Failed to clear remix hashes",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Admin endpoint: Get all whitelist entries with full metadata
 * GET /api/_admin/remix-hashes-full
 */
export async function handleGetRemixHashesFull(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const entries = await getAllWhitelistEntries();

    res.status(200).json({
      entries,
      lastUpdated: Date.now(),
    });
  } catch (error) {
    console.error("Error getting whitelist entries:", error);
    res.status(500).json({
      error: "Failed to get whitelist entries",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Admin endpoint: Delete single hash from whitelist
 * POST /api/_admin/delete-remix-hash
 * Body: { hash: string }
 */
export async function handleDeleteRemixHash(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { hash } = req.body;

    if (!hash || typeof hash !== "string") {
      res.status(400).json({ error: "Hash is required" });
      return;
    }

    await deleteHashFromWhitelist(hash);

    res.status(200).json({
      success: true,
      message: "Hash deleted from whitelist",
      hash,
    });
  } catch (error) {
    console.error("Error deleting remix hash:", error);
    res.status(500).json({
      error: "Failed to delete remix hash",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
