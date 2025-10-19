import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});
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

const IDP_DESCRIBE = new Map<
  string,
  { status: number; body: any; ts: number }
>();

export const handleDescribe: any = [
  upload.single("image"),
  (async (req: any, res: any) => {
    try {
      const idempotencyKey = (req.get("Idempotency-Key") ||
        req.get("Idempotency-Key")) as string | undefined;
      if (idempotencyKey && IDP_DESCRIBE.has(idempotencyKey)) {
        const cached = IDP_DESCRIBE.get(idempotencyKey)!;
        if (Date.now() - cached.ts < 60_000) {
          res.status(cached.status).json({ ok: true, ...cached.body });
          return;
        } else {
          IDP_DESCRIBE.delete(idempotencyKey);
        }
      }

      const f = (req as any).file as any;
      if (!f)
        return res
          .status(400)
          .json({ ok: false, error: "no_file", message: "No file uploaded" });
      const base64 = f.buffer.toString("base64");
      const dataUrl = `data:${f.mimetype};base64,${base64}`;

      if (!process.env.OPENAI_API_KEY) {
        console.error(
          "OPENAI_API_KEY is not configured on the server (describe)",
        );
        return res
          .status(503)
          .json({
            ok: false,
            error: "openai_api_key_missing",
            message: "OpenAI API key not configured on the server",
          });
      }

      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const rawFacts = (req as any).body?.facts as string | undefined;
      let facts: any = undefined;
      try {
        facts = rawFacts ? JSON.parse(rawFacts) : undefined;
      } catch {}

      const factsText = facts
        ? `\nFacts (MUST be consistent): AI=${!!facts.is_ai_generated}, animation=${!!facts.is_animation}, human_face=${!!facts.has_human_face}, full_face_visible=${!!facts.is_full_face_visible}, famous_person=${!!facts.is_famous_person}, has_brand_or_character=${!!facts.has_known_brand_or_character}.`
        : "";

      const instruction =
        "You are an AI image captioner. Return ONLY strict minified JSON with keys: title, description, brand, character. Title: concise 2-5 words. Description: ONE short sentence under 120 characters (avoid commas lists). If a known brand or fictional character is clearly present, set 'brand' or 'character' to its short name, otherwise use an empty string. Keep neutral and DO NOT contradict provided facts." +
        factsText +
        " No extra text.";

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
        max_output_tokens: 120,
      } as any);

      const extractText = (r: any) => {
        if (!r) return "";
        if (typeof r.output_text === "string" && r.output_text.trim())
          return r.output_text;
        if (Array.isArray(r.output) && r.output.length > 0) {
          for (const o of r.output) {
            if (o?.content && Array.isArray(o.content)) {
              for (const c of o.content) {
                if (
                  (c.type === "output_text" || c.type === "text") &&
                  typeof c.text === "string"
                )
                  return c.text;
              }
            }
            if (typeof o?.text === "string") return o.text;
          }
        }
        return r?.choices?.[0]?.message?.content ?? "";
      };

      const text = (extractText(response) || "").trim();
      const parsed = parseJsonLoose(text) || {};
      let title = typeof parsed.title === "string" ? parsed.title : "";
      let description =
        typeof parsed.description === "string" ? parsed.description : "";
      const brand = typeof parsed.brand === "string" ? parsed.brand : "";
      const character =
        typeof parsed.character === "string" ? parsed.character : "";

      const clip = (s: string, max: number) =>
        s && s.length > max ? s.slice(0, max - 1) + "…" : s;
      title = clip(title, 50);
      description = clip(description, 120);

      const body = { title, description, brand, character };
      if (idempotencyKey)
        IDP_DESCRIBE.set(idempotencyKey, { status: 200, body, ts: Date.now() });
      return res.status(200).json({ ok: true, ...body });
    } catch (err) {
      console.error("describe error:", err);
      return res.status(500).json({ ok: false, error: "describe_failed" });
    }
  }) as any,
];
