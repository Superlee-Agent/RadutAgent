import multer from "multer";
import { RequestHandler } from "express";
import { createHash } from "crypto";

const cache = new Map<string, any>();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const PRIMARY_MODEL = process.env.OPENAI_PRIMARY_MODEL ?? "gpt-4o-mini";
const VERIFIER_MODEL = process.env.OPENAI_VERIFIER_MODEL ?? PRIMARY_MODEL;

const aiAnswers = new Set([1, 2, 3, 7, 8, 9]);
const humanAnswers = new Set([4, 5, 6]);

const ALLOWED_FACE_TYPES = new Set(["None", "Ordinary", "Famous", "Unknown"]);
const ALLOWED_SOURCE_LABELS = new Set(["AI", "Human", "Animation", "Unknown"]);

interface StageAttempt {
  model: string;
  ok: boolean;
  text: string | null;
  raw: any;
  stage: "analysis" | "analysis-repair" | "verdict" | "verdict-repair";
}

interface AnalysisNormalized {
  scene_summary: string;
  source_primary: "AI" | "Human" | "Animation" | "Unknown";
  source_scores: {
    ai: number | null;
    human: number | null;
    animation: number | null;
  };
  faces_presence: "None" | "Ordinary" | "Famous" | "Unknown";
  faces_count: number | null;
  faces_evidence: string[];
  brand_present: boolean | null;
  brand_names: string[];
  brand_evidence: string[];
  animation_is: boolean | null;
  animation_evidence: string[];
  ai_artifacts: string[];
  human_cues: string[];
  overall_notes: string[];
  recommended_answer: number | null;
  recommended_reason: string | null;
  raw: any;
}

interface VerdictExtras {
  decision_notes: string[];
  consistency_warnings: string[];
  diagnostics: {
    face_type: "None" | "Ordinary" | "Famous" | "Unknown" | null;
    has_brand: boolean | null;
    is_animation: boolean | null;
    source_label: "AI" | "Human" | "Animation" | "Unknown" | null;
    confidence: number | null;
  };
  raw: any;
}

const ANALYSIS_PROMPT = `You are an expert forensic analyst. Examine the provided image thoroughly and return ONLY a single JSON object (no markdown, no text outside JSON).
Schema (exact keys, camelCase):
{
  "scene_summary": string,
  "source_assessment": {
    "primary_source": "AI" | "Human" | "Animation" | "Unknown",
    "ai_score": number | null,   // probability 0-1
    "human_score": number | null,
    "animation_score": number | null,
    "rationale": string[]        // bullet-like evidence phrases
  },
  "faces": {
    "presence": "None" | "Ordinary" | "Famous" | "Unknown",
    "count": integer | null,
    "evidence": string[],
    "noted_identities": string[]
  },
  "brand": {
    "present": boolean,
    "names": string[],
    "evidence": string[]
  },
  "animation": {
    "is_animation": boolean,
    "evidence": string[]
  },
  "ai_artifacts": string[],
  "human_cues": string[],
  "overall_notes": string[],
  "recommended_answer": 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | null,
  "recommended_reason": string | null
}
Rules:
- Fill every field; use null only where schema allows.
- "rationale", "evidence", "ai_artifacts", "human_cues", "overall_notes" are arrays of terse strings.
- "count" must be an integer >=0 or null if unknown.
- "primary_source" must reflect your best hypothesis given evidence.
- If unsure about brands, set present=false and leave names empty.
- If unsure about identities, use "Unknown" presence and empty arrays.
- "recommended_answer" should follow the mappings: 1=AI no face/brand, 2=AI with brand/celebrity, 3=AI with ordinary face, 4=Human no face/brand, 5=Human celebrity, 6=Human ordinary face, 7=AI animation no face/brand, 8=AI animation with brand/celebrity, 9=AI animation with ordinary face. Use null if ambiguous.
- "recommended_reason" <= 25 words describing decisive cues.
Return exactly one JSON object.`;

const CLASSIFICATION_GUIDE = `Answer mapping:
1 = AI, no human face, no brand/celebrity
2 = AI, contains brand/celebrity face
3 = AI, contains ordinary human face
4 = Human, no human face, no brand/celebrity
5 = Human, contains brand/celebrity face
6 = Human, contains ordinary human face
7 = AI animation, no face, no brand
8 = AI animation, contains brand/celebrity
9 = AI animation, contains ordinary human face`;

const VERDICT_PROMPT_HEADER = `You are a compliance verifier ensuring the image is assigned a single answer (1-9) using the guide below. Use the stage-1 analysis as facts. Check for inconsistencies before deciding. ${CLASSIFICATION_GUIDE}
Output ONLY one JSON object with keys exactly:
{
  "selected_answer": 1|2|3|4|5|6|7|8|9|null,
  "reason": string|null,
  "generation_type": "AI generated"|"Human generated"|null,
  "reconstructed_prompt": string|null,
  "decision_notes": string[],
  "consistency_warnings": string[],
  "diagnostics": {
    "face_type": "None"|"Ordinary"|"Famous"|"Unknown"|null,
    "has_brand": boolean|null,
    "is_animation": boolean|null,
    "source_label": "AI"|"Human"|"Animation"|"Unknown"|null,
    "confidence": number|null
  }
}
Rules:
- "reason" must cite decisive evidence in <=20 words.
- Align "generation_type" with selected answer (AI answers => "AI generated", human answers => "Human generated").
- If evidence insufficient, set selected_answer=null, reason="ambiguous", generation_type=null, reconstructed_prompt=null.
- Keep arrays concise (<=4 items each).
- "confidence" is 0-1 or null.
- Provide warnings if stage-1 data conflicts with the mapping.`;

function buildVerdictPrompt(analysis: AnalysisNormalized, issues: string[]) {
  const context = {
    scene_summary: analysis.scene_summary,
    source_primary: analysis.source_primary,
    source_scores: analysis.source_scores,
    faces_presence: analysis.faces_presence,
    faces_count: analysis.faces_count,
    brand_present: analysis.brand_present,
    brand_names: analysis.brand_names,
    animation_is: analysis.animation_is,
    ai_artifacts: analysis.ai_artifacts,
    human_cues: analysis.human_cues,
    notes: analysis.overall_notes,
    recommended_answer: analysis.recommended_answer,
    recommended_reason: analysis.recommended_reason,
    analysis_issues: issues,
  };
  return `${VERDICT_PROMPT_HEADER}\nStage-1 analysis (JSON):\n${JSON.stringify(context, null, 2)}\nDecide now.`;
}

function buildRepairPrompt(basePrompt: string, priorOutput: string) {
  return `${basePrompt}\nPrevious output was invalid: ${priorOutput}\nRe-run and return ONLY a valid JSON object matching the schema.`;
}

function normalizeTextArray(value: any): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return out.slice(0, 8);
}

function normalizeScore(value: any): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  if (!Number.isFinite(value)) return null;
  if (value < 0 || value > 1) return null;
  return value;
}

function normalizeCount(value: any): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  if (!Number.isFinite(value)) return null;
  const int = Math.max(0, Math.round(value));
  return int;
}

function normalizeAnalysis(raw: any): {
  analysis: AnalysisNormalized;
  issues: string[];
} {
  const issues: string[] = [];
  const sceneSummary =
    typeof raw?.scene_summary === "string" ? raw.scene_summary.trim() : "";
  if (!sceneSummary) issues.push("analysis.scene_summary_missing");

  const sourceAssessment = raw?.source_assessment ?? {};
  const primarySourceRaw =
    typeof sourceAssessment.primary_source === "string"
      ? sourceAssessment.primary_source.trim()
      : "";
  const primarySource = ALLOWED_SOURCE_LABELS.has(primarySourceRaw as any)
    ? (primarySourceRaw as AnalysisNormalized["source_primary"])
    : "Unknown";
  if (primarySource === "Unknown")
    issues.push("analysis.primary_source_unknown");
  const aiScore = normalizeScore(sourceAssessment.ai_score);
  const humanScore = normalizeScore(sourceAssessment.human_score);
  const animationScore = normalizeScore(sourceAssessment.animation_score);

  const faces = raw?.faces ?? {};
  const presenceRaw =
    typeof faces.presence === "string" ? faces.presence.trim() : "";
  const facesPresence = ALLOWED_FACE_TYPES.has(presenceRaw as any)
    ? (presenceRaw as AnalysisNormalized["faces_presence"])
    : "Unknown";
  if (facesPresence === "Unknown")
    issues.push("analysis.faces_presence_unknown");
  const facesCount = normalizeCount(faces.count);
  const facesEvidence = normalizeTextArray(faces.evidence);
  const brand = raw?.brand ?? {};
  const brandPresent =
    typeof brand.present === "boolean" ? brand.present : null;
  if (brandPresent === null) issues.push("analysis.brand_present_missing");
  const brandNames = normalizeTextArray(brand.names);
  const brandEvidence = normalizeTextArray(brand.evidence);

  const animation = raw?.animation ?? {};
  const animationIs =
    typeof animation.is_animation === "boolean" ? animation.is_animation : null;
  if (animationIs === null) issues.push("analysis.animation_missing");
  const animationEvidence = normalizeTextArray(animation.evidence);

  const aiArtifacts = normalizeTextArray(raw?.ai_artifacts);
  const humanCues = normalizeTextArray(raw?.human_cues);
  const overallNotes = normalizeTextArray(raw?.overall_notes);

  let recommendedAnswer: number | null = null;
  if (typeof raw?.recommended_answer === "number") {
    if (
      Number.isInteger(raw.recommended_answer) &&
      raw.recommended_answer >= 1 &&
      raw.recommended_answer <= 9
    ) {
      recommendedAnswer = raw.recommended_answer;
    } else {
      issues.push("analysis.recommended_answer_out_of_range");
    }
  } else if (raw?.recommended_answer === null) {
    recommendedAnswer = null;
  } else if (raw?.recommended_answer !== undefined) {
    issues.push("analysis.recommended_answer_invalid");
  }

  const recommendedReason =
    typeof raw?.recommended_reason === "string"
      ? raw.recommended_reason.trim() || null
      : null;

  const analysis: AnalysisNormalized = {
    scene_summary: sceneSummary,
    source_primary: primarySource,
    source_scores: {
      ai: aiScore,
      human: humanScore,
      animation: animationScore,
    },
    faces_presence: facesPresence,
    faces_count: facesCount,
    faces_evidence: facesEvidence,
    brand_present: brandPresent,
    brand_names: brandNames,
    brand_evidence: brandEvidence,
    animation_is: animationIs,
    animation_evidence: animationEvidence,
    ai_artifacts: aiArtifacts,
    human_cues: humanCues,
    overall_notes: overallNotes,
    recommended_answer: recommendedAnswer,
    recommended_reason: recommendedReason,
    raw,
  };

  return { analysis, issues };
}

function extractVerdictExtras(raw: any): VerdictExtras {
  const decisionNotes = normalizeTextArray(raw?.decision_notes).slice(0, 6);
  const consistencyWarnings = normalizeTextArray(
    raw?.consistency_warnings,
  ).slice(0, 6);
  const diagnostics = raw?.diagnostics ?? {};

  const faceTypeRaw =
    typeof diagnostics.face_type === "string"
      ? diagnostics.face_type.trim()
      : null;
  const faceType =
    faceTypeRaw && ALLOWED_FACE_TYPES.has(faceTypeRaw as any)
      ? (faceTypeRaw as VerdictExtras["diagnostics"]["face_type"])
      : null;
  const hasBrand =
    typeof diagnostics.has_brand === "boolean" ? diagnostics.has_brand : null;
  const isAnimation =
    typeof diagnostics.is_animation === "boolean"
      ? diagnostics.is_animation
      : null;
  const sourceLabelRaw =
    typeof diagnostics.source_label === "string"
      ? diagnostics.source_label.trim()
      : null;
  const sourceLabel =
    sourceLabelRaw && ALLOWED_SOURCE_LABELS.has(sourceLabelRaw as any)
      ? (sourceLabelRaw as VerdictExtras["diagnostics"]["source_label"])
      : null;
  const confidence = normalizeScore(diagnostics.confidence);

  return {
    decision_notes: decisionNotes,
    consistency_warnings: consistencyWarnings,
    diagnostics: {
      face_type: faceType,
      has_brand: hasBrand,
      is_animation: isAnimation,
      source_label: sourceLabel,
      confidence,
    },
    raw,
  };
}

const analyzeHandler: RequestHandler = async (req, res) => {
  try {
    const file = (req as any).file as
      | {
          buffer: Buffer;
          size: number;
          mimetype: string;
          originalname?: string;
        }
      | undefined;
    if (!file) return res.status(400).json({ error: "No file received" });

    const hash = createHash("sha256").update(file.buffer).digest("hex");
    if (cache.has(hash)) return res.status(200).json(cache.get(hash));

    const MAX_ACCEPT = 8 * 1024 * 1024;
    if (file.size > MAX_ACCEPT)
      return res
        .status(413)
        .json({ error: "file_too_large", maxSize: MAX_ACCEPT });

    const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

    const attempts: StageAttempt[] = [];

    const callModel = async (
      stage: StageAttempt["stage"],
      prompt: string,
      model: string,
    ) => {
      const response = await client.responses.create({
        model,
        temperature: 0.1,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: dataUrl },
            ],
          },
        ],
        max_output_tokens: 900,
      } as any);
      const text = (extractText(response) || "").trim();
      attempts.push({
        model,
        ok: text.length > 0,
        text: text || null,
        raw: response,
        stage,
      });
      return { response, text };
    };

    const tryParseJson = (t: string) => {
      if (!t) return null;
      try {
        return JSON.parse(t);
      } catch {
        const m = t.match(/\{[\s\S]*\}/);
        if (m) {
          try {
            return JSON.parse(m[0]);
          } catch {
            return null;
          }
        }
        return null;
      }
    };

    const analysisCall = await callModel(
      "analysis",
      ANALYSIS_PROMPT,
      PRIMARY_MODEL,
    );
    let analysisParsed = tryParseJson(analysisCall.text);
    let { analysis, issues: analysisIssues } =
      normalizeAnalysis(analysisParsed);

    if (analysisIssues.length > 0 || !analysis.scene_summary) {
      const repairPrompt = buildRepairPrompt(
        ANALYSIS_PROMPT,
        analysisCall.text,
      );
      const analysisRepair = await callModel(
        "analysis-repair",
        repairPrompt,
        PRIMARY_MODEL,
      );
      const analysisParsedRepair = tryParseJson(analysisRepair.text);
      const repairResult = normalizeAnalysis(analysisParsedRepair);
      if (repairResult.analysis.scene_summary) {
        analysis = repairResult.analysis;
        analysisIssues = Array.from(
          new Set([...analysisIssues, ...repairResult.issues]),
        );
        analysisParsed = analysisParsedRepair;
      } else {
        analysisIssues = Array.from(
          new Set([
            ...analysisIssues,
            ...repairResult.issues,
            "analysis.repair_failed",
          ]),
        );
      }
    }

    const verdictPrompt = buildVerdictPrompt(analysis, analysisIssues);
    const verdictCall = await callModel(
      "verdict",
      verdictPrompt,
      VERIFIER_MODEL,
    );
    let verdictParsed = tryParseJson(verdictCall.text);

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
        return { out, issues, extras: extractVerdictExtras({}) };
      }

      const sa = rawParsed.selected_answer;
      if (sa === null || sa === undefined) {
        out.selected_answer = null;
        issues.push("selected_answer_missing");
      } else if (
        typeof sa === "number" &&
        Number.isInteger(sa) &&
        sa >= 1 &&
        sa <= 9
      ) {
        out.selected_answer = sa;
      } else if (typeof sa === "string" && /^\d+$/.test(sa)) {
        const n = parseInt(sa, 10);
        if (n >= 1 && n <= 9) out.selected_answer = n;
        else {
          issues.push("selected_answer_out_of_range");
        }
      } else {
        issues.push("selected_answer_invalid_type");
      }

      if (typeof rawParsed.reason === "string" && rawParsed.reason.trim()) {
        out.reason = rawParsed.reason.trim();
      } else if (rawParsed.reason == null) {
        out.reason = null;
        issues.push("reason_missing");
      } else {
        issues.push("reason_invalid");
      }

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

      if (typeof rawParsed.reconstructed_prompt === "string") {
        const trimmed = rawParsed.reconstructed_prompt.trim();
        out.reconstructed_prompt = trimmed.length ? trimmed : null;
      } else if (rawParsed.reconstructed_prompt == null) {
        out.reconstructed_prompt = null;
      } else {
        issues.push("reconstructed_prompt_invalid");
      }

      if (out.selected_answer != null) {
        if (aiAnswers.has(out.selected_answer)) {
          if (out.generation_type !== "AI generated") {
            issues.push("generation_type_mismatch_with_answer");
            out.generation_type = "AI generated";
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

      const extras = extractVerdictExtras(rawParsed);
      return { out, issues, extras };
    };

    let validation = validateAndNormalize(verdictParsed, verdictCall.text);

    const needsRetry =
      validation.issues.length > 0 &&
      (validation.out.selected_answer === null ||
        validation.out.reason === null);

    if (needsRetry) {
      const repairPrompt = buildRepairPrompt(verdictPrompt, verdictCall.text);
      const verdictRepair = await callModel(
        "verdict-repair",
        repairPrompt,
        VERIFIER_MODEL,
      );
      const verdictParsedRepair = tryParseJson(verdictRepair.text);
      const validationRepair = validateAndNormalize(
        verdictParsedRepair,
        verdictRepair.text,
      );
      if (
        validationRepair.out.selected_answer !== null &&
        validationRepair.out.reason !== null
      ) {
        verdictParsed = verdictParsedRepair;
        validation = validationRepair;
      } else {
        validation.issues = Array.from(
          new Set([
            ...validation.issues,
            ...validationRepair.issues,
            "verdict.repair_failed",
          ]),
        );
      }
    }

    const normalized = {
      selected_answer: validation.out.selected_answer,
      reason: validation.out.reason,
      generation_type: validation.out.generation_type,
      reconstructed_prompt: validation.out.reconstructed_prompt,
      analysis,
      analysis_issues: analysisIssues,
      verdict_details: validation.extras,
      _analysis_raw_output:
        attempts.find((a) => a.stage === "analysis")?.text ?? null,
      _verdict_raw_output:
        attempts.find((a) => a.stage === "verdict")?.text ?? null,
      _raw_model_output: attempts.length
        ? (attempts[attempts.length - 1].text ?? "")
        : "",
      _timestamp: new Date().toISOString(),
      _validation_issues: Array.from(
        new Set([...analysisIssues, ...validation.issues]),
      ),
    };

    const out = {
      parsed: normalized,
      raw_attempts: attempts.map((a) => ({
        ok: a.ok,
        text: a.text,
        model: a.model,
        stage: a.stage,
      })),
      attempts,
    };
    cache.set(hash, out);
    return res.status(200).json(out);
  } catch (err) {
    console.error("analyze error:", err);
    return res.status(500).json({ error: "analysis_failed" });
  }
};

export const handleAnalyze: any = [upload.single("image"), analyzeHandler];
