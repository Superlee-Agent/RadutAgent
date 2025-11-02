import fs from "fs/promises";
import path from "path";

/**
 * Refactored Whitelist Structure:
 * - Hash: SHA256 of pure image pixels only (no metadata)
 * - Metadata: Stored separately (ipId, title, timestamp, pHash, visionDescription)
 *
 * This separation allows:
 * 1. Pure image hash matching
 * 2. Flexible metadata storage
 * 3. Multiple metadata per hash (if needed)
 * 4. Clean hash-based comparison
 */

interface RemixImageMetadata {
  ipId: string;
  title: string;
  timestamp: number;
  pHash?: string;
  visionDescription?: string;
  // Parent IP Details
  parentIpIds?: string[];
  licenseTermsIds?: string[];
  licenseTemplates?: string[];
  // License Configuration
  royaltyContext?: string;
  maxMintingFee?: string; // Wei format
  maxRts?: string; // Wei format
  maxRevenueShare?: number; // 0-100
  licenseVisibility?: string;
  // Derivative Status
  isDerivative?: boolean;
  parentsCount?: number;
}

interface RemixHashEntry {
  hash: string; // SHA256 of pure image pixels only
  metadata: RemixImageMetadata;
}

interface RemixHashWhitelist {
  entries: RemixHashEntry[];
  lastUpdated: number;
}

const WHITELIST_PATH = path.join(
  process.cwd(),
  "server",
  "data",
  "remix-hashes.json",
);

/**
 * Ensure the data directory exists
 */
async function ensureDataDir(): Promise<void> {
  const dataDir = path.dirname(WHITELIST_PATH);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

/**
 * Load whitelist from file
 */
async function loadWhitelist(): Promise<RemixHashWhitelist> {
  await ensureDataDir();

  try {
    const content = await fs.readFile(WHITELIST_PATH, "utf-8");
    const parsed = JSON.parse(content);

    // Support both old and new formats
    if (parsed.entries && parsed.entries.length > 0) {
      if (parsed.entries[0].metadata) {
        // New format: already separated
        return parsed;
      } else if (parsed.entries[0].ipId) {
        // Old format: needs migration
        console.log("[Remix Hash] Migrating whitelist to new format...");
        const migratedEntries = parsed.entries.map((entry: any) => ({
          hash: entry.hash,
          metadata: {
            ipId: entry.ipId,
            title: entry.title,
            timestamp: entry.timestamp,
            pHash: entry.pHash,
            visionDescription: entry.visionDescription,
          },
        }));

        return {
          entries: migratedEntries,
          lastUpdated: parsed.lastUpdated || Date.now(),
        };
      }
    }

    return parsed;
  } catch (error) {
    // File doesn't exist or is empty, return empty whitelist
    return { entries: [], lastUpdated: Date.now() };
  }
}

/**
 * Save whitelist to file
 */
async function saveWhitelist(whitelist: RemixHashWhitelist): Promise<void> {
  await ensureDataDir();
  whitelist.lastUpdated = Date.now();
  await fs.writeFile(WHITELIST_PATH, JSON.stringify(whitelist, null, 2));
}

/**
 * Add hash to whitelist with separated metadata
 * @param hash SHA256 hash of pure image pixels only
 * @param metadata Image metadata (ipId, title, etc)
 */
export async function addHashToWhitelist(
  hash: string,
  metadata: RemixImageMetadata,
): Promise<void> {
  const whitelist = await loadWhitelist();

  // Check if hash already exists
  const exists = whitelist.entries.some((entry) => entry.hash === hash);

  if (!exists) {
    whitelist.entries.push({
      hash,
      metadata,
    });

    await saveWhitelist(whitelist);
    console.log(
      `[Remix Hash] Added hash ${hash} for IP ${metadata.ipId} (${metadata.title})`,
    );
  }
}

/**
 * Check if hash exists in whitelist
 * Returns the metadata if found, null otherwise
 */
export async function checkHashInWhitelist(
  hash: string,
): Promise<RemixImageMetadata | null> {
  const whitelist = await loadWhitelist();
  const entry = whitelist.entries.find((entry) => entry.hash === hash);
  return entry?.metadata || null;
}

/**
 * Get all hashes in whitelist
 */
export async function getAllWhitelistHashes(): Promise<string[]> {
  const whitelist = await loadWhitelist();
  return whitelist.entries.map((entry) => entry.hash);
}

/**
 * Get all entries with metadata
 */
export async function getAllWhitelistEntries(): Promise<RemixHashEntry[]> {
  const whitelist = await loadWhitelist();
  return whitelist.entries;
}

/**
 * Clear whitelist (admin function)
 */
export async function clearWhitelist(): Promise<void> {
  const whitelist: RemixHashWhitelist = {
    entries: [],
    lastUpdated: Date.now(),
  };
  await saveWhitelist(whitelist);
  console.log("[Remix Hash] Whitelist cleared");
}

/**
 * Update metadata for a hash (add visionDescription, etc)
 */
export async function updateHashMetadata(
  hash: string,
  partialMetadata: Partial<RemixImageMetadata>,
): Promise<void> {
  const whitelist = await loadWhitelist();
  const entry = whitelist.entries.find((e) => e.hash === hash);

  if (entry) {
    entry.metadata = { ...entry.metadata, ...partialMetadata };
    await saveWhitelist(whitelist);
    console.log(`[Remix Hash] Updated metadata for hash ${hash}`);
  }
}

/**
 * Delete hash from whitelist
 */
export async function deleteHashFromWhitelist(hash: string): Promise<void> {
  const whitelist = await loadWhitelist();
  const initialLength = whitelist.entries.length;
  whitelist.entries = whitelist.entries.filter((entry) => entry.hash !== hash);

  if (whitelist.entries.length < initialLength) {
    await saveWhitelist(whitelist);
    console.log(`[Remix Hash] Deleted hash ${hash} from whitelist`);
  }
}
