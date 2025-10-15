import type { RequestHandler } from "express";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

async function postToWeb3Storage(data: Buffer | string, contentType = "application/octet-stream") {
  const token = process.env.WEB3_STORAGE_TOKEN || process.env.WEB3STORAGE_TOKEN || process.env.WEB3_STORAGE_API_TOKEN;
  if (!token) throw new Error("WEB3_STORAGE_TOKEN not set");
  const res = await fetch("https://api.web3.storage/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
    },
    body: typeof data === "string" ? Buffer.from(data) : data,
  } as any);
  if (!res.ok) throw new Error(`web3.storage error: ${res.status}`);
  const j = (await res.json()) as any;
  const cid: string = j?.cid || j?.value?.cid || j?.cidV1 || j?.data?.cid;
  if (!cid) throw new Error("cid_missing");
  return cid;
}

export const handleIpfsUpload: any = [
  upload.single("file"),
  (async (req, res) => {
    try {
      const f = (req as any).file as Express.Multer.File | undefined;
      if (!f) return res.status(400).json({ error: "no_file" });
      const cid = await postToWeb3Storage(f.buffer, f.mimetype || "application/octet-stream");
      return res.status(200).json({ cid, url: `ipfs://${cid}` });
    } catch (err) {
      console.error("ipfs upload error:", err);
      return res.status(500).json({ error: "ipfs_upload_failed" });
    }
  }) as RequestHandler,
];

export const handleIpfsUploadJson: RequestHandler = async (req, res) => {
  try {
    const data = req.body?.data ?? req.body;
    const json = typeof data === "string" ? data : JSON.stringify(data ?? {});
    const cid = await postToWeb3Storage(json, "application/json");
    return res.status(200).json({ cid, url: `ipfs://${cid}` });
  } catch (err) {
    console.error("ipfs json upload error:", err);
    return res.status(500).json({ error: "ipfs_json_upload_failed" });
  }
};
