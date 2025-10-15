export type IpfsUploadResult = { cid: string; url: string; https?: string };

export async function uploadFile(file: File | Blob): Promise<IpfsUploadResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/ipfs/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error(`IPFS upload failed: ${res.status}`);
  return (await res.json()) as IpfsUploadResult;
}

export async function uploadJSON(data: unknown): Promise<IpfsUploadResult> {
  const res = await fetch("/api/ipfs/upload-json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) throw new Error(`IPFS json upload failed: ${res.status}`);
  return (await res.json()) as IpfsUploadResult;
}

export function extractCid(input: string): string {
  try {
    const s = String(input);
    const ipfsIdx = s.indexOf("ipfs://");
    if (ipfsIdx >= 0) return s.slice(ipfsIdx + 7);
    const httpsIdx = s.indexOf("/ipfs/");
    if (httpsIdx >= 0) return s.slice(httpsIdx + 6);
    return s;
  } catch {
    return input as any;
  }
}

export function toIpfsUri(cid: string): string {
  return `ipfs://${cid}`;
}

export function toHttps(cidOrUrl: string): string {
  try {
    const s = String(cidOrUrl);
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
  } catch {}
  const cid = extractCid(cidOrUrl);
  return `https://ipfs.io/ipfs/${cid}`;
}
