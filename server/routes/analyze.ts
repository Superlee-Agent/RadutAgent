import multer from "multer";
import { RequestHandler } from "express";

const crypto = await import("crypto");

const cache = new Map<string, any>();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

// Improved prompt: stricter schema, examples, failure handling, and explicit rules
const USER_PROMPT = `Analisa gambar berikut dengan sangat cermat, lalu pilih hanya SATU dari daftar jawaban (1 sampai 9) di bawah ini yang paling sesuai.
Return ONLY a single JSON object (no text, no markdown, no code fences, no explanation).

Schema (exact):
{
  "selected_answer": <integer 1..9 or null>,
  "reason": <string or null, one short sentence, <=20 words>,
  "generation_type": <"AI generated" or "Human generated" or null>,
  "reconstructed_prompt": <string or null>
}

Rules:
- "selected_answer" must be an integer 1..9, or null if ambiguous/unreadable.
- "generation_type" must be exactly either "AI generated" or "Human generated", or null if uncertain.
- "reconstructed_prompt" include ONLY if you are CONFIDENT the image is AI-generated; otherwise set to null.
- "reason" must be a short single sentence explaining the decisive cue.
- If image unreadable or ambiguous, set selected_answer=null, reason="ambiguous" (or "unreadable"), generation_type=null, reconstructed_prompt=null.
- Do NOT add any additional fields, metadata, or explanation outside the JSON object.

DAFTAR JAWABAN (singkat):
1 = AI, no human face, no brand/celebrity
2 = AI, contains brand/celebrity face
3 = AI, contains ordinary human face
4 = Human, no human face, no brand/celebrity
5 = Human, contains brand/celebrity face
6 = Human, contains ordinary human face
7 = AI animation, no face, no brand
8 = AI animation, contains brand/celebrity
9 = AI animation, contains ordinary human face

EXAMPLE 1:
Input (description): a stylized landscape with no humans or brands.
Output (exact JSON):
{"selected_answer":1,"reason":"No human faces or brands detected; looks AI-rendered","generation_type":"AI generated","reconstructed_prompt":null}

EXAMPLE 2:
Input (description): a photograph of Taylor Swift at an awards show.
Output (exact JSON):
{"selected_answer":5,"reason":"Contains a celebrity face (Taylor Swift)","generation_type":"Human generated","reconstructed_prompt":null}

If you understand, output the JSON for the provided image now.`;

const aiAnswers = new Set([1, 2, 3, 7, 8, 9]);
const humanAnswers = new Set([4, 5, 6]);

const analyzeHandler: RequestHandler = async (req, res) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "No file received" });

    // caching by hash
    const hash = crypto.createHash("sha256").update(file.buffer).digest("hex");
    if (cache.has(hash)) return res.status(200).json(cache.get(hash));

    // size guard
    const MAX_ACCEPT = 8 * 1024 * 1024; // 8MB
    if (file.size > MAX_ACCEPT) return res.status(413).json({ error: "file_too_large", maxSize: MAX_ACCEPT });

    const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

    try {
      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

      const attempts: any[] = [];

      const callModel = async (prompt: string) => {
        const resp = await client.responses.create({
          model: "gpt-4o-mini",
          temperature: 0,
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: prompt },
                { type: "input_image", image_url: dataUrl },
              ],
            },
          ],
          max_output_tokens: 400,
        });
        const text = (extractText(resp) || "").trim();
        attempts.push({ model: "gpt-4o-mini", ok: !!text, text: text || null, raw: resp });
        return { resp, text };
      };

      const tryParseJson = (t: string) => {
        if (!t) return null;
        try {
          return JSON.parse(t);
        } catch {
          const m = t.match(/\{[\s\S]*\}/);
          if (m) {
            try { return JSON.parse(m[0]); } catch { return null; }
          }
          return null;
        }
      };

      const validateAndNormalize = (rawParsed: any, rawText: string) => {
        const issues: string[] = [];
        const out: any = {
          selected_answer: null,
          reason: null,
          generation_type: null,
          reconstructed_prompt: null,
        };

        if (!rawParsed || typeof rawParsed !== "object") {
          issues.push("parsed_not_object");
          return { out, issues };
        }

        // selected_answer
        const sa = rawParsed.selected_answer;
        if (sa === null || sa === undefined) {
          out.selected_answer = null;
          issues.push("selected_answer_missing");
        } else if (typeof sa === "number" && Number.isInteger(sa) && sa >= 1 && sa <= 9) {
          out.selected_answer = sa;
        } else if (typeof sa === "string" && /^\d+$/.test(sa)) {
          const n = parseInt(sa, 10);
          if (n >= 1 && n <= 9) out.selected_answer = n; else { issues.push("selected_answer_out_of_range"); }
        } else {
          issues.push("selected_answer_invalid_type");
        }

        // reason
        if (typeof rawParsed.reason === "string" && rawParsed.reason.trim()) {
          out.reason = rawParsed.reason.trim();
        } else if (rawParsed.reason == null) {
          out.reason = null;
          issues.push("reason_missing");
        } else {
          issues.push("reason_invalid");
        }

        // generation_type
        if (typeof rawParsed.generation_type === "string") {
          const gt = rawParsed.generation_type.trim();
          if (gt === "AI generated" || gt === "Human generated") {
            out.generation_type = gt;
          } else {
            issues.push("generation_type_invalid_value");
          }
        } else if (rawParsed.generation_type == null) {
          out.generation_type = null;
          issues.push("generation_type_missing");
        } else {
          issues.push("generation_type_invalid_type");
        }

        // reconstructed_prompt
        if (typeof rawParsed.reconstructed_prompt === "string") {
          out.reconstructed_prompt = rawParsed.reconstructed_prompt;
        } else if (rawParsed.reconstructed_prompt == null) {
          out.reconstructed_prompt = null;
        } else {
          issues.push("reconstructed_prompt_invalid");
        }

        // consistency check: if selected_answer maps to AI/Human, enforce generation_type
        if (out.selected_answer != null) {
          if (aiAnswers.has(out.selected_answer)) {
            if (out.generation_type !== "AI generated") {
              issues.push("generation_type_mismatch_with_answer");
              out.generation_type = "AI generated"; // correct deterministically
            }
          } else if (humanAnswers.has(out.selected_answer)) {
            if (out.generation_type !== "Human generated") {
              issues.push("generation_type_mismatch_with_answer");
              out.generation_type = "Human generated";
            }
          } else {
            issues.push("selected_answer_not_in_mapping");
          }
        }

        return { out, issues };
      };

      // 1st attempt
      const first = await callModel(USER_PROMPT);
      let parsed = tryParseJson(first.text);

      let validation = validateAndNormalize(parsed, first.text);

      // If critical issues (missing selected_answer or missing reason) or parsed null, attempt a single deterministic retry
      const needsRetry = (validation.issues.length > 0) && (validation.out.selected_answer === null || validation.out.reason === null);
      if (needsRetry) {
        const retryPrompt = `Previous model output (may be invalid): ${first.text}\n\nREPLY WITH ONLY the exact JSON object matching the schema: {"selected_answer":<1..9|null>,"reason":<string|null>,"generation_type":<"AI generated"|"Human generated"|null>,"reconstructed_prompt":<string|null>}. If ambiguous set selected_answer:null and generation_type:null and reconstructed_prompt:null.`;
        const second = await callModel(retryPrompt);
        const parsed2 = tryParseJson(second.text);
        const validation2 = validateAndNormalize(parsed2, second.text);

        // prefer the second if it fixes missing fields, otherwise keep first but merge issues
        if (validation2.out.selected_answer !== null && validation2.out.reason !== null) {
          parsed = parsed2;
          validation = validation2;
        } else {
          // merge issues
          validation.issues = Array.from(new Set([...validation.issues, ...validation2.issues]));
        }
      }

      // final normalized output
      const normalized = {
        selected_answer: validation.out.selected_answer,
        reason: validation.out.reason,
        generation_type: validation.out.generation_type,
        reconstructed_prompt: validation.out.reconstructed_prompt,
        _raw_model_output: (attempts.length ? attempts[attempts.length - 1].text : ""),
        _timestamp: new Date().toISOString(),
        _validation_issues: validation.issues,
      };

      const out = { parsed: normalized, raw_attempts: attempts.map((a) => ({ ok: a.ok, text: a.text, model: a.model })), attempts };
      cache.set(hash, out);
      return res.status(200).json(out);

    } catch (err) {
      console.error("OpenAI error:", err);
      const fallback = { parsed: null, raw: "", attempts: [], error: String(err) };
      cache.set(hash, fallback);
      return res.status(200).json(fallback);
    }
  } catch (err) {
    console.error("analyze error:", err);
    return res.status(500).json({ error: "analysis_failed" });
  }
};

export const handleAnalyze: any = [upload.single("image"), analyzeHandler];
