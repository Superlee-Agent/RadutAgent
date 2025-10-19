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

const IDP_STORE = new Map<string, { status: number; body: any; ts: number }>();

export const handleUpload: any = [
  upload.single("image"),
  (async (req: any, res: any) => {
    try {
      // Idempotency support: if client supplies Idempotency-Key header, return cached response
      const idempotencyKey = (req.get("Idempotency-Key") ||
        req.get("Idempotency-Key")) as string | undefined;
      if (idempotencyKey && IDP_STORE.has(idempotencyKey)) {
        const cached = IDP_STORE.get(idempotencyKey)!;
        // If cached item is older than 60s, fallthrough and compute again
        if (Date.now() - cached.ts < 60_000) {
          res.status(cached.status).json({ ok: true, ...cached.body });
          return;
        } else {
          IDP_STORE.delete(idempotencyKey);
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
        console.error("OPENAI_API_KEY is not configured on the server");
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
        const body = { ok: false, error: "parse_failed", raw: text };
        if (idempotencyKey)
          IDP_STORE.set(idempotencyKey, { status: 422, body, ts: Date.now() });
        return res.status(422).json(body);
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

      const ANSWER_DETAILS: Record<string, any> = {
        "1": {
          type: "AI Generated",
          notes: "AI-generated image; No human face; No famous brand/character",
          registrationStatus: "✅ IP can be registered",
        },
        "2": {
          type: "AI Generated",
          notes: "AI-generated image; Contains famous brand/character",
          registrationStatus: "❌ IP cannot be registered",
        },
        "3": {
          type: "AI Generated",
          notes: "AI-generated image; Famous person's face; full face visible",
          registrationStatus: "❌ IP cannot be registered",
        },
        "4": {
          type: "AI Generated",
          notes:
            "AI-generated image; Famous person's face; not fully visible (cropped)",
          registrationStatus: "✅ IP can be registered",
        },
        "5": {
          type: "AI Generated",
          notes:
            "AI-generated image; Human face visible; not famous; full face visible",
          registrationStatus: "✅ IP can be registered",
        },
        "6": {
          type: "AI Generated",
          notes:
            "AI-generated image; Human face visible; not famous; not fully visible",
          registrationStatus: "✅ IP can be registered",
        },
        "7": {
          type: "Non-AI Image",
          notes: "Photograph/realistic; Contains famous brand or character",
          registrationStatus: "❌ IP cannot be registered",
        },
        "8": {
          type: "Non-AI Image",
          notes:
            "Photograph/realistic; Famous person's face; full face visible",
          registrationStatus: "❌ IP cannot be registered",
        },
        "9": {
          type: "Non-AI Image",
          notes:
            "Photograph/realistic; Famous person's face; not fully visible",
          registrationStatus: "✅ IP can be registered",
        },
        "10": {
          type: "Non-AI Image",
          notes:
            "Photograph/realistic; Human face visible; not famous; full face visible",
          registrationStatus: "✅ IP can be registered",
        },
        "11": {
          type: "Non-AI Image",
          notes:
            "Photograph/realistic; Human face visible; not famous; not fully visible",
          registrationStatus: "✅ IP can be registered",
        },
        "12": {
          type: "AI Animation",
          notes: "AI-generated animation/cartoon; No famous brand/character",
          registrationStatus: "✅ IP can be registered",
        },
        "13": {
          type: "AI Animation",
          notes:
            "AI-generated animation/cartoon; Contains famous brand/character",
          registrationStatus: "❌ IP cannot be registered",
        },
        "14": {
          type: "Non-AI Animation",
          notes: "Non-AI animation/cartoon; No famous brand/character",
          registrationStatus: "✅ IP can be registered",
        },
        "15": {
          type: "Non-AI Animation",
          notes: "Non-AI animation/cartoon; Contains famous brand/character",
          registrationStatus: "❌ IP cannot be registered",
        },
      };

      const GROUPS = {
        DIRECT_REGISTER_MANUAL_AI: [1, 4, 5, 6, 9, 10, 11, 12, 14],
      };

      const isManualAI = GROUPS.DIRECT_REGISTER_MANUAL_AI.includes(group);
      const info = ANSWER_DETAILS[String(group)];
      const canRegisterByText = info && info.registrationStatus.includes("✅");
      const canRegister = canRegisterByText;

      const brandGroups = [2, 7, 13, 15];
      const famousFullGroups = [3, 8];
      const famousNotFullGroups = [4, 9];
      const ordinaryFullGroups = [5, 10];
      const ordinaryNotFullGroups = [6, 11];
      const animationGroups = [12, 13, 14, 15];
      const aiGroups = [1, 2, 3, 4, 5, 6, 12, 13];

      const isAnimGroup = animationGroups.includes(group);
      const isAIGroup = aiGroups.includes(group);
      const isBrandGroup = brandGroups.includes(group);

      let classification = isAnimGroup
        ? isAIGroup
          ? "AI Animation"
          : "Non-AI Animation"
        : isAIGroup
          ? "AI Image"
          : "Non-AI Image";

      if (isBrandGroup) {
        classification += ` with a famous brand/character`;
      } else if (famousFullGroups.includes(group)) {
        classification += " with full public figure face";
      } else if (famousNotFullGroups.includes(group)) {
        classification += " with public figure not fully visible";
      } else if (ordinaryFullGroups.includes(group)) {
        classification += " with full regular person face";
      } else if (ordinaryNotFullGroups.includes(group)) {
        classification += " with regular person not fully visible";
      } else {
        classification += " without faces/brands";
      }

      let verdict = "";
      if (canRegister) {
        if (famousNotFullGroups.includes(group)) {
          verdict =
            "This IP can be registered because the public figure is not fully visible.";
        } else if (ordinaryNotFullGroups.includes(group)) {
          verdict =
            "This IP can be registered because the face is not fully visible.";
        } else if (isAnimGroup && !isBrandGroup) {
          verdict =
            "This IP can be registered because it's an animation without brand/character.";
        } else if (
          !isBrandGroup &&
          !famousFullGroups.includes(group) &&
          !ordinaryFullGroups.includes(group)
        ) {
          verdict =
            "This IP can be registered because it doesn't show faces/brands.";
        } else {
          verdict = "This IP can be registered as it meets policy criteria.";
        }
      } else {
        if (isBrandGroup) {
          verdict = `This IP cannot be registered directly because it contains a famous brand/character.`;
        } else if (famousFullGroups.includes(group)) {
          verdict =
            "This IP cannot be registered directly because it shows a public figure's full face.";
        } else if (group === 0) {
          verdict = "Analysis inconclusive; please submit for review.";
        } else {
          verdict = "This IP cannot be registered.";
        }
      }

      const display = `This is ${classification}. ${verdict}`;

      const body = {
        group,
        details: flags,
        title,
        description,
        display,
        canRegister,
        isManualAI,
      };
      if (idempotencyKey)
        IDP_STORE.set(idempotencyKey, { status: 200, body, ts: Date.now() });
      return res.status(200).json(body);
    } catch (err) {
      console.error("upload error:", err);
      const body = {
        ok: false,
        error: "analysis_failed",
        message: String(err?.message || "Analysis failed"),
      };
      if (req.get("Idempotency-Key") || req.get("Idempotency-Key")) {
        const key = (req.get("Idempotency-Key") ||
          req.get("Idempotency-Key")) as string;
        IDP_STORE.set(key, { status: 500, body, ts: Date.now() });
      }
      return res.status(500).json(body);
    }
  }) as any,
];
