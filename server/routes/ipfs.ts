import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY; // e.g. mysubdomain.mypinata.cloud

async function pinFileToPinata(name: string, buffer: Buffer, mimetype: string) {
  if (!PINATA_JWT) throw new Error("PINATA_JWT not set");
  const form = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], {
    type: mimetype || "application/octet-stream",
  });
  form.append("file", blob, name || "file");
  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: form as any,
  } as any);
  if (!res.ok) throw new Error(`pinata_file_error:${res.status}`);
  const j = (await res.json()) as any;
  const cid: string = j?.IpfsHash || j?.Hash || j?.cid;
  if (!cid) throw new Error("cid_missing");
  return cid;
}

async function pinJsonToPinata(json: unknown) {
  if (!PINATA_JWT) throw new Error("PINATA_JWT not set");
  const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
      "Content-Type": "application/json",
    },
    body: typeof json === "string" ? json : JSON.stringify(json ?? {}),
  } as any);
  if (!res.ok) throw new Error(`pinata_json_error:${res.status}`);
  const j = (await res.json()) as any;
  const cid: string = j?.IpfsHash || j?.Hash || j?.cid;
  if (!cid) throw new Error("cid_missing");
  return cid;
}

export const handleIpfsUpload: any = [
  upload.single("file"),
  (async (req: any, res: any) => {
    try {
      const f = (req as any).file as any;
      if (!f) return res.status(400).json({ error: "no_file" });
      const cid = await pinFileToPinata(
        f.originalname || "file",
        f.buffer,
        f.mimetype || "application/octet-stream",
      );
      const https = PINATA_GATEWAY
        ? `https://${PINATA_GATEWAY}/ipfs/${cid}`
        : undefined;
      return res.status(200).json({ cid, url: `ipfs://${cid}`, https });
    } catch (err) {
      console.error("ipfs upload error:", err);
      return res.status(500).json({ error: "ipfs_upload_failed" });
    }
  }) as any,
];

export const handleIpfsUploadJson: any = async (req: any, res: any) => {
  try {
    const data = req.body?.data ?? req.body;
    const cid = await pinJsonToPinata(data);
    const https = PINATA_GATEWAY
      ? `https://${PINATA_GATEWAY}/ipfs/${cid}`
      : undefined;
    return res.status(200).json({ cid, url: `ipfs://${cid}`, https });
  } catch (err) {
    console.error("ipfs json upload error:", err);
    return res.status(500).json({ error: "ipfs_json_upload_failed" });
  }
};
