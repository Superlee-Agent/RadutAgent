import type { RequestHandler } from "express";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const MODEL = process.env.OPENAI_PRIMARY_MODEL || "gpt-4o-mini";

function parseJsonLoose(text: string | null | undefined): any | null {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export const handleDescribe: any = [
  upload.single("image"),
  (async (req, res) => {
    try {
      const f = (req as any).file as Express.Multer.File | undefined;
      if (!f) return res.status(400).json({ error: "no_file" });
      const base64 = f.buffer.toString("base64");
      const dataUrl = `data:${f.mimetype};base64,${base64}`;

      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const instruction =
        "You are an AI image captioner. Return ONLY strict minified JSON with keys: title, description. Title: concise 3-6 words describing the image. Description: 1-2 sentences summarizing what is depicted (no line breaks). No extra text.";

      const response: any = await client.responses.create({
        model: MODEL,
        temperature: 0.3,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: instruction } as any,
              { type: "input_image", image_url: dataUrl } as any,
            ],
          },
        ],
        max_output_tokens: 200,
      } as any);

      const extractText = (r: any) => {
        if (!r) return "";
        if (typeof r.output_text === "string" && r.output_text.trim()) return r.output_text;
        if (Array.isArray(r.output) && r.output.length > 0) {
          for (const o of r.output) {
            if (o?.content && Array.isArray(o.content)) {
              for (const c of o.content) {
                if ((c.type === "output_text" || c.type === "text") && typeof c.text === "string") return c.text;
              }
            }
            if (typeof o?.text === "string") return o.text;
          }
        }
        return r?.choices?.[0]?.message?.content ?? "";
      };

      const text = (extractText(response) || "").trim();
      const parsed = parseJsonLoose(text) || {};
      const title = typeof parsed.title === "string" ? parsed.title : "";
      const description = typeof parsed.description === "string" ? parsed.description : "";

      return res.status(200).json({ title, description });
    } catch (err) {
      console.error("describe error:", err);
      return res.status(500).json({ error: "describe_failed" });
    }
  }) as RequestHandler,
];
