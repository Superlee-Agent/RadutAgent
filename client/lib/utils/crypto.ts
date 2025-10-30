function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256HexOfFile(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return `0x${toHex(hash)}`;
}

// Minimal keccak256 implementation (public domain) adapted for small inputs
// Reference: https://github.com/emn178/js-sha3 (trimmed keccak256)
export function keccak256Hex(data: Uint8Array): string {
  // Lightweight keccak implementation (compact) — deterministic for our json strings
  // Constants
  const RC = [
    1n,
    32898n,
    9223372036854808714n,
    9223372039002292224n,
    32907n,
    2147483649n,
    9223372039002292353n,
    9223372036854808585n,
    138n,
    136n,
    2147516425n,
    2147483658n,
    2147516555n,
    9223372036854775947n,
    9223372036854808713n,
    9223372036854808579n,
    9223372036854775936n,
    32778n,
    9223372036854808704n,
    2147483649n,
    9223372039002292353n,
    9223372039002292232n,
    32907n,
    9223372036854808579n,
  ];
  // Using a very compact but slower implementation (sufficient for metadata strings)
  const s = new Array<bigint>(25).fill(0n);
  const rate = 136; // keccak256 bitrate
  // pad10*1
  const bytes = new Uint8Array(Math.floor((data.length + 1 + 136) / 136) * 136);
  bytes.set(data);
  bytes[data.length] = 0x01;
  bytes[bytes.length - 1] |= 0x80;
  for (let i = 0; i < bytes.length; i += rate) {
    for (let j = 0; j < rate; j += 8) {
      const idx = i + j;
      let lo = 0n;
      for (let k = 0; k < 8; k++)
        lo |= BigInt(bytes[idx + k] || 0) << (8n * BigInt(k));
      s[j / 8] ^= lo;
    }
    // keccak-f[1600]
    for (let round = 0; round < 24; round++) {
      const C = new Array<bigint>(5);
      for (let x = 0; x < 5; x++)
        C[x] = s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20];
      const D = new Array<bigint>(5);
      for (let x = 0; x < 5; x++)
        D[x] =
          C[(x + 4) % 5] ^ ((C[(x + 1) % 5] << 1n) | (C[(x + 1) % 5] >> 63n));
      for (let i2 = 0; i2 < 25; i2 += 5)
        for (let x = 0; x < 5; x++) s[i2 + x] ^= D[x];
      let [x, y] = [1, 0];
      let current = s[1];
      for (let t = 0; t < 24; t++) {
        const X = y;
        y = (2 * x + 3 * y) % 5;
        x = X;
        const shift = [
          [0, 36, 3, 41, 18],
          [1, 44, 10, 45, 2],
          [62, 6, 43, 15, 61],
          [28, 55, 25, 21, 56],
          [27, 20, 39, 8, 14],
        ][y][x];
        const tmp = s[5 * y + x];
        s[5 * y + x] =
          ((current << BigInt(shift)) | (current >> BigInt(64 - shift))) &
          ((1n << 64n) - 1n);
        current = tmp;
      }
      for (let y2 = 0; y2 < 5; y2++) {
        const base = 5 * y2;
        const a0 = s[base + 0],
          a1 = s[base + 1],
          a2 = s[base + 2],
          a3 = s[base + 3],
          a4 = s[base + 4];
        s[base + 0] = a0 ^ (~a1 & a2);
        s[base + 1] = a1 ^ (~a2 & a3);
        s[base + 2] = a2 ^ (~a3 & a4);
        s[base + 3] = a3 ^ (~a4 & a0);
        s[base + 4] = a4 ^ (~a0 & a1);
      }
      s[0] ^= RC[round];
    }
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++)
    out[i] = Number((s[Math.floor(i / 8)] >> BigInt(8 * (i % 8))) & 0xffn);
  return `0x${Array.from(out)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function keccakOfJson(data: unknown): string {
  const str = typeof data === "string" ? data : JSON.stringify(data);
  const bytes = new TextEncoder().encode(str);
  return keccak256Hex(bytes);
}
