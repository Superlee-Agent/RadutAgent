import type { RequestHandler } from "express";
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const MODEL = process.env.OPENAI_PRIMARY_MODEL || "gpt-4o-mini";

type AnalysisFlags = {
  is_ai_generated: boolean;
  is_animation: boolean;
  has_human_face: boolean;
  is_full_face_visible: boolean;
  is_famous_person: boolean;
  has_known_brand_or_character: boolean;
};

function safeBool(v: any): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (t === "true" || t === "yes" || t === "ya" || t === "1") return true;
    if (t === "false" || t === "no" || t === "tidak" || t === "0") return false;
  }
  return false;
}

function determineGroup(result: AnalysisFlags): number {
  const {
    is_ai_generated,
    is_animation,
    has_human_face,
    is_full_face_visible,
    is_famous_person,
    has_known_brand_or_character,
  } = result;

  // Prioritize animation categories regardless of faces
  if (is_animation) {
    if (is_ai_generated) return has_known_brand_or_character ? 13 : 12;
    return has_known_brand_or_character ? 15 : 14;
  }

  if (
    is_ai_generated &&
    !has_human_face &&
    !has_known_brand_or_character &&
    !is_animation
  )
    return 1;
  if (is_ai_generated && has_known_brand_or_character && !has_human_face)
    return 2;
  if (
    is_ai_generated &&
    has_human_face &&
    is_famous_person &&
    is_full_face_visible
  )
    return 3;
  if (
    is_ai_generated &&
    has_human_face &&
    is_famous_person &&
    !is_full_face_visible
  )
    return 4;
  if (
    is_ai_generated &&
    has_human_face &&
    !is_famous_person &&
    is_full_face_visible
  )
    return 5;
  if (
    is_ai_generated &&
    has_human_face &&
    !is_famous_person &&
    !is_full_face_visible
  )
    return 6;
  if (!is_ai_generated && has_known_brand_or_character) return 7;
  if (
    !is_ai_generated &&
    has_human_face &&
    is_famous_person &&
    is_full_face_visible
  )
    return 8;
  if (
    !is_ai_generated &&
    has_human_face &&
    is_famous_person &&
    !is_full_face_visible
  )
    return 9;
  if (
    !is_ai_generated &&
    has_human_face &&
    !is_famous_person &&
    is_full_face_visible
  )
    return 10;
  if (
    !is_ai_generated &&
    has_human_face &&
    !is_famous_person &&
    !is_full_face_visible
  )
    return 11;
  if (is_ai_generated && is_animation && !has_known_brand_or_character)
    return 12;
  if (is_ai_generated && is_animation && has_known_brand_or_character)
    return 13;
  if (!is_ai_generated && is_animation && !has_known_brand_or_character)
    return 14;
  if (!is_ai_generated && is_animation && has_known_brand_or_character)
    return 15;

  return 0;
}

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

export const handleUpload: any = [
  upload.single("image"),
  (async (req, res) => {
    try {
      const f = (req as any).file as Express.Multer.File | undefined;
      if (!f) return res.status(400).json({ error: "no_file" });
      const base64 = f.buffer.toString("base64");
      const dataUrl = `data:${f.mimetype};base64,${base64}`;

      if (!process.env.OPENAI_API_KEY) {
        console.error("OPENAI_API_KEY is not configured on the server");
        return res
          .status(503)
          .json({ error: "openai_api_key_missing", message: "OpenAI API key not configured on the server" });
      }

      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const instruction =
        "You are an AI image analyzer. Return ONLY strict minified JSON with keys: is_ai_generated, is_animation, has_human_face, is_full_face_visible, is_famous_person, has_known_brand_or_character, title, description. Definitions: is_animation = TRUE for 2D/3D animated/cartoon/illustration style (anime, toon, CGI), FALSE for photographic/realistic renders. is_full_face_visible = TRUE only if a single human face is clearly visible facing the camera with both eyes, nose, mouth and chin unobstructed, and the full head (forehead to chin) is not cropped; side/angle >45°, heavy occlusion (mask, big sunglasses obscuring eyes), or any crop that cuts forehead/chin/ears => FALSE. If has_human_face is FALSE, is_full_face_visible must be FALSE. For title: concise 3-6 words describing the image. For description: 1-2 sentences summarizing what is depicted. Use true/false booleans for flags. No extra text.";

      const response: any = await client.responses.create({
        model: MODEL,
        temperature: 0,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: instruction } as any,
              { type: "input_image", image_url: dataUrl } as any,
            ],
          },
        ],
        max_output_tokens: 300,
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
      const parsed = parseJsonLoose(text);

      if (!parsed || typeof parsed !== "object") {
        return res.status(422).json({ error: "parse_failed", raw: text });
      }

      const flags: AnalysisFlags = {
        is_ai_generated: safeBool((parsed as any).is_ai_generated),
        is_animation: safeBool((parsed as any).is_animation),
        has_human_face: safeBool((parsed as any).has_human_face),
        is_full_face_visible: safeBool((parsed as any).is_full_face_visible),
        is_famous_person: safeBool((parsed as any).is_famous_person),
        has_known_brand_or_character: safeBool(
          (parsed as any).has_known_brand_or_character,
        ),
      };
      const title =
        typeof (parsed as any).title === "string" ? (parsed as any).title : "";
      const description =
        typeof (parsed as any).description === "string"
          ? (parsed as any).description
          : "";
      // Enforce logical consistency
      flags.is_full_face_visible = !!(
        flags.has_human_face && flags.is_full_face_visible
      );

      const group = determineGroup(flags);

      return res
        .status(200)
        .json({ group, details: flags, title, description });
    } catch (err) {
      console.error("upload error:", err);
      return res.status(500).json({ error: "analysis_failed" });
    }
  }) as RequestHandler,
];
