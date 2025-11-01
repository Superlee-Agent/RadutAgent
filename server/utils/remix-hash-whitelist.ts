import fs from "fs/promises";
import path from "path";

interface RemixHashEntry {
  hash: string;
  ipId: string;
  title: string;
  timestamp: number;
  pHash?: string; // Perceptual hash for similarity detection
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
    return JSON.parse(content);
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
 * Add hash to whitelist
 */
export async function addHashToWhitelist(
  hash: string,
  ipId: string,
  title: string,
  pHash?: string,
): Promise<void> {
  const whitelist = await loadWhitelist();

  // Check if hash already exists
  const exists = whitelist.entries.some((entry) => entry.hash === hash);

  if (!exists) {
    whitelist.entries.push({
      hash,
      ipId,
      title,
      timestamp: Date.now(),
      pHash,
    });

    await saveWhitelist(whitelist);
    console.log(
      `[Remix Hash] Added hash ${hash} for IP ${ipId}${pHash ? ` (pHash: ${pHash})` : ""}`,
    );
  }
}

/**
 * Check if hash exists in whitelist
 * Returns the entry if found, null otherwise
 */
export async function checkHashInWhitelist(
  hash: string,
): Promise<RemixHashEntry | null> {
  const whitelist = await loadWhitelist();
  const entry = whitelist.entries.find((entry) => entry.hash === hash);
  return entry || null;
}

/**
 * Get all hashes in whitelist
 */
export async function getAllWhitelistHashes(): Promise<string[]> {
  const whitelist = await loadWhitelist();
  return whitelist.entries.map((entry) => entry.hash);
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
