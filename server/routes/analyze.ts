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

// New classification groups from CSV
const CLASS_CODES = [
  "1",
  "2A",
  "2B",
  "3A",
  "3B",
  "4",
  "5A",
  "5B",
  "6A",
  "6B",
  "7",
  "8",
  "9",
] as const;

const GROUP_META: Record<
  (typeof CLASS_CODES)[number],
  { source: "AI" | "Human" | "AI (Animasi)"; notes: string }
> = {
  "1": {
    source: "AI",
    notes: "Tanpa wajah manusia, tanpa brand/karakter terkenal",
  },
  "2A": {
    source: "AI",
    notes: "Brand/karakter terkenal atau wajah manusia terkenal (full wajah)",
  },
  "2B": {
    source: "AI",
    notes:
      "Brand/karakter terkenal atau wajah manusia terkenal (tidak full wajah)",
  },
  "3A": {
    source: "AI",
    notes: "Wajah manusia biasa (tidak terkenal), full wajah",
  },
  "3B": {
    source: "AI",
    notes: "Wajah manusia biasa (tidak terkenal), tidak full wajah",
  },
  "4": {
    source: "Human",
    notes: "Tanpa wajah manusia, tanpa brand/karakter terkenal",
  },
  "5A": {
    source: "Human",
    notes:
      "Brand/karakter terkenal atau wajah manusia terkenal (tidak full wajah)",
  },
  "5B": {
    source: "Human",
    notes: "Brand/karakter terkenal atau wajah manusia terkenal (full wajah)",
  },
  "6A": {
    source: "Human",
    notes: "Wajah manusia biasa (tidak terkenal), full wajah",
  },
  "6B": {
    source: "Human",
    notes: "Wajah manusia biasa (tidak terkenal), tidak full wajah",
  },
  "7": {
    source: "AI (Animasi)",
    notes: "Tanpa wajah manusia, tanpa brand/karakter terkenal",
  },
  "8": {
    source: "AI (Animasi)",
    notes: "Brand/karakter terkenal atau wajah manusia terkenal",
  },
  "9": {
    source: "AI (Animasi)",
    notes: "Wajah manusia biasa (tidak terkenal)",
  },
};

function generationTypeFor(
  code: (typeof CLASS_CODES)[number] | null,
): "AI generated" | "Human generated" | null {
  if (!code) return null;
  const meta = GROUP_META[code as keyof typeof GROUP_META];
  if (!meta) return null;
  if (meta.source === "Human") return "Human generated";
  return "AI generated"; // AI and AI (Animasi) map to AI generated
}

const ALLOWED_FACE_TYPES = new Set([
  "None",
  "Partial",
  "Ordinary",
  "Famous",
  "Unknown",
]);
const ALLOWED_SOURCE_LABELS = new Set(["AI", "Human", "Animation", "Unknown"]);

interface StageAttempt {
  model: string;
  ok: boolean;
  text: string | null;
  raw: any;
  stage:
    | "scenarios"
    | "batch"
    | "simple"
    | "analysis"
    | "analysis-repair"
    | "verdict"
    | "verdict-repair";
}

interface AnalysisNormalized {
  scene_summary: string;
  source_primary: "AI" | "Human" | "Animation" | "Unknown";
  source_scores: {
    ai: number | null;
    human: number | null;
    animation: number | null;
  };
  faces_presence: "None" | "Partial" | "Ordinary" | "Famous" | "Unknown";
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
  recommended_answer: string | null;
  recommended_reason: string | null;
  raw: any;
}

interface VerdictExtras {
  decision_notes: string[];
  consistency_warnings: string[];
  diagnostics: {
    face_type: "None" | "Partial" | "Ordinary" | "Famous" | "Unknown" | null;
    has_brand: boolean | null;
    is_animation: boolean | null;
    source_label: "AI" | "Human" | "Animation" | "Unknown" | null;
    confidence: number | null;
  };
  raw: any;
}

const SIMPLE_CLASSIFY_PROMPT = `gambar ini termasuk grup yg mana, jawab hny dengan nomor grup: Grup,Sumber Gambar,Kandungan,Status Registrasi IP,Opsi Tambahan,Smart Licensing,AI Training
1,AI,"Tanpa wajah manusia, tanpa brand/karakter terkenal","✅ Bisa diregistrasi","-","Commercial Remix License (minting fee & revenue share manual)","❌ Tidak diizinkan (fixed)"
2A,AI,"Brand/karakter terkenal atau wajah manusia terkenal (full wajah)","❌ Tidak diizinkan","Submit Review","-","-"
2B,AI,"Brand/karakter terkenal atau wajah manusia terkenal (tidak full wajah)","✅ Bisa diregistrasi","-","Commercial Remix License (minting fee & revenue share manual)","❌ Tidak diizinkan (fixed)"
3A,AI,"Wajah manusia biasa (tidak terkenal), full wajah","❌ Tidak langsung diizinkan","Take Selfie Photo → (Jika sukses ✅, jika gagal ❌ Submit Review)","Commercial Remix License (jika sukses)","❌ Tidak diizinkan (fixed)"
3B,AI,"Wajah manusia biasa (tidak terkenal), tidak full wajah","✅ Bisa diregistrasi","-","Commercial Remix License (minting fee & revenue share manual)","❌ Tidak diizinkan (fixed)"
4,Manusia,"Tanpa wajah manusia, tanpa brand/karakter terkenal","✅ Bisa diregistrasi","-","Commercial Remix License (minting fee & revenue share manual)","✅ Diizinkan (manual setting)"
5A,Manusia,"Brand/karakter terkenal atau wajah manusia terkenal (tidak full wajah)","✅ Bisa diregistrasi","-","Commercial Remix License (minting fee & revenue share manual)","✅ Diizinkan (manual setting)"
5B,Manusia,"Brand/karakter terkenal atau wajah manusia terkenal (full wajah)","❌ Tidak diizinkan","Submit Review","-","-"
6A,Manusia,"Wajah manusia biasa (tidak terkenal), full wajah","❌ Tidak langsung diizinkan","Take Selfie Photo → (Jika sukses ✅, jika gagal ❌ Submit Review)","Commercial Remix License (jika sukses)","✅ Diizinkan (manual setting)"
6B,Manusia,"Wajah manusia biasa (tidak terkenal), tidak full wajah","✅ Bisa diregistrasi","-","Commercial Remix License (minting fee & revenue share manual)","✅ Diizinkan (manual setting)"
7,"AI (Animasi)","Tanpa wajah manusia, tanpa brand/karakter terkenal","✅ Bisa diregistrasi","-","Commercial Remix License (minting fee & revenue share manual)","❌ Tidak diizinkan (fixed)"
8,"AI (Animasi)","Brand/karakter terkenal atau wajah manusia terkenal","❌ Tidak diizinkan","Submit Review","-","-"
9,"AI (Animasi)","Wajah manusia biasa (tidak terkenal)","❌ Tidak langsung diizinkan","Take Selfie Photo → (Jika sukses ✅, jika gagal ❌ Submit Review)","Commercial Remix License (jika sukses)","❌ Tidak diizinkan (fixed)"`;

const MULTI_IMAGE_PROMPT = `Kamu adalah sistem klasifikasi IP otomatis. Tugasmu adalah menganalisis beberapa gambar sekaligus dan mengeluarkan hasil klasifikasi lengkap dalam format JSON.

Langkah-langkah Analisis per Gambar:

1️⃣ Tentukan Sumber Gambar:
- AI → Hasil sepenuhnya dari model AI (DALL·E, MidJourney, Stable Diffusion, dll)
- Manusia → Hasil jepretan kamera nyata atau gambar manual manusia
- AI (Animasi) → Hasil AI berbentuk animasi/cartoon, bukan foto nyata
Jawaban: AI / Manusia / AI (Animasi)

2️⃣ Tentukan Kandungan Gambar:
- Apakah ada wajah manusia? → Ya / Tidak
- Jika ya, apakah wajahnya penuh (rambut sampai dagu)? → Ya / Tidak
- Apakah wajah termasuk orang terkenal (selebriti/public figure)? → Ya / Tidak
- Apakah ada brand atau karakter terkenal (misal Disney, Marvel, anime populer)? → Ya / Tidak
- Jumlah orang dalam gambar
- Animasi / Style: 2D, 3D, cartoon, stylized, realistic
- Metadata / Provenance: EXIF, watermark, software edit (jika tersedia)

Format jawaban JSON per gambar:
{
  "wajah_manusia": "Ya/Tidak",
  "wajah_full": "Ya/Tidak",
  "wajah_terkenal": "Ya/Tidak",
  "brand_karakter_terkenal": "Ya/Tidak",
  "jumlah_orang": angka,
  "animasi_style": "text",
  "metadata": "text"
}

3️⃣ Berdasarkan hasil di atas, tentukan Grup_UTAMA, Sub_Grup, dan aturan IP:
- Gunakan tabel klasifikasi 13 sub-grup yang sudah ada (versi diperluas)
- Tentukan Status Registrasi IP, Opsi Tambahan, Smart Licensing, AI Training sesuai logika grup
- Gunakan threshold confidence ≥0.85 untuk keputusan otomatis, jika dibawah → tandai “Review Manual”

4️⃣ Output batch JSON untuk semua gambar yang dianalisis, format:
[
  {
    "nama_file_gambar": "string",
    "Grup_UTAMA": "1–9",
    "Sub_Grup": "1|2A|2B|3A|3B|4|5A|5B|6A|6B|7|8|9",
    "status_registrasi": "✅ Bisa diregistrasi" | "❌ Tidak diizinkan" | "❌ Tidak langsung diizinkan",
    "opsi_tambahan": "Take Selfie Photo" | "Submit Review" | "-",
    "smart_licensing": "Commercial Remix License (minting fee & revenue share manual)" | "-",
    "ai_training": "✅ Diizinkan" | "❌ Tidak diizinkan (fixed)",
    "confidence": number
  }
]

Tabel klasifikasi (CSV):
Grup_UTAMA,Sub_Grup,Sumber Gambar,Subkategori Sumber,Wajah Manusia,Wajah Full,Wajah Terkenal,Brand/Karakter Terkenal,Jumlah Orang,Animasi/Style,Metadata/Provenance,Status Registrasi IP,Opsi Tambahan,Smart Licensing,AI Training,Confidence
1,1,AI,Realistic/Styled,Tidak,-,-,Tidak,-,-,-,✅ Bisa diregistrasi,-,Commercial Remix License,❌ Tidak diizinkan (fixed),0.9
2,2A,AI,Realistic/Styled,Ya,Ya,Ya,Ya,-,-,-,❌ Tidak diizinkan,Submit Review,-,-,0.95
2,2B,AI,Realistic/Styled,Ya,Tidak,Ya,Ya,-,-,-,✅ Bisa diregistrasi,-,Commercial Remix License,❌ Tidak diizinkan (fixed),0.9
3,3A,AI,Realistic/Styled,Ya,Ya,Tidak,Tidak,1,-,-,❌ Tidak langsung diizinkan,Take Selfie Photo → (Jika sukses ✅, gagal ❌ Submit Review),Commercial Remix License (jika sukses),❌ Tidak diizinkan (fixed),0.85
3,3B,AI,Realistic/Styled,Ya,Tidak,Tidak,Tidak,1,-,-,✅ Bisa diregistrasi,-,Commercial Remix License,❌ Tidak diizinkan (fixed),0.85
4,4,Manusia,Foto/Ilustrasi,Tidak,-,-,Tidak,-,-,Ada EXIF, watermark optional,✅ Bisa diregistrasi,-,Commercial Remix License,✅ Diizinkan (manual),0.9
5,5A,Manusia,Foto/Ilustrasi,Ya,Tidak,Ya,Ya,-,-,Ada EXIF, watermark optional,✅ Bisa diregistrasi,-,Commercial Remix License,✅ Diizinkan (manual),0.9
5,5B,Manusia,Foto/Ilustrasi,Ya,Ya,Ya,Ya,-,-,Ada EXIF, watermark optional,❌ Tidak diizinkan,Submit Review,-,-,0.95
6,6A,Manusia,Foto/Ilustrasi,Ya,Ya,Tidak,Tidak,1,-,Ada EXIF, watermark optional,❌ Tidak langsung diizinkan,Take Selfie Photo → (Jika sukses ✅, gagal ❌ Submit Review),Commercial Remix License (jika sukses),✅ Diizinkan (manual),0.85
6,6B,Manusia,Foto/Ilustrasi,Ya,Tidak,Tidak,Tidak,1,-,Ada EXIF, watermark optional,✅ Bisa diregistrasi,-,Commercial Remix License,✅ Diizinkan (manual),0.85
7,7,AI (Animasi),Cartoon/2D/3D,Tidak,-,-,Tidak,-,2D/3D Cartoon,-,✅ Bisa diregistrasi,-,Commercial Remix License,❌ Tidak diizinkan (fixed),0.9
8,8,AI (Animasi),Cartoon/2D/3D,Ya,Ya/Tidak,Ya,Ya,-,2D/3D Cartoon,-,❌ Tidak diizinkan,Submit Review,-,-,0.95
9,9,AI (Animasi),Cartoon/2D/3D,Ya,Ya/Tidak,Tidak,Tidak,1,2D/3D Cartoon,-,❌ Tidak langsung diizinkan,Take Selfie Photo → (Jika sukses ✅, gagal ❌ Submit Review),Commercial Remix License (jika sukses),❌ Tidak diizinkan (fixed),0.85`;

const SINGLE_IMAGE_SCENARIOS_PROMPT = `Kamu adalah sistem klasifikasi IP super canggih. Analisis 1 gambar berikut dan buat 4 skenario paralel untuk memastikan klasifikasi paling akurat.

Instruksi:

1️⃣ Analisis sumber gambar:
- AI, Manusia, AI Animasi, Hybrid
- Pertimbangkan semua kemungkinan ambigu, buat skenario berbeda jika perlu

2️⃣ Analisis wajah & brand:
- Wajah manusia: Ya/Tidak
- Full wajah: Ya/Tidak
- Terkenal: Ya/Tidak
- Jumlah orang
- Ekspresi wajah: tersenyum / serius / tertutup masker / lainnya
- Brand/karakter terkenal: Ya/Tidak (sebutkan nama/kategori jika ada)

3️⃣ Analisis style & metadata:
- Style: realistik / stylized / 2D / 3D / pixel art / low-poly
- Metadata: EXIF, watermark, software AI, timestamp

4️⃣ Klasifikasi IP:
- Tentukan Grup_UTAMA & Sub_Grup sesuai tabel 13 sub-grup + 9 grup utama
- Tentukan Status Registrasi IP, Opsi Tambahan, Smart Licensing, AI Training
- Hitung confidence score 0–1 per skenario

5️⃣ Output JSON 4 skenario paralel (JAWAB HANYA JSON VALID TANPA TEKS LAIN):
{
  "nama_file_gambar": "string",
  "skenario": [
    {
      "id": 1,
      "Grup_UTAMA": "1–9",
      "Sub_Grup": "1|2A|2B|3A|3B|4|5A|5B|6A|6B|7|8|9",
      "status_registrasi": "✅ Bisa diregistrasi" | "❌ Tidak diizinkan" | "❌ Tidak langsung diizinkan",
      "opsi_tambahan": "Take Selfie Photo" | "Submit Review" | "-",
      "smart_licensing": "Commercial Remix License (minting fee & revenue share manual)" | "-",
      "ai_training": "✅ Diizinkan" | "❌ Tidak diizinkan (fixed)",
      "confidence": number,
      "atribut": {
        "sumber": "AI | Manusia | AI (Animasi) | Hybrid",
        "wajah_manusia": "Ya/Tidak",
        "wajah_full": "Ya/Tidak",
        "wajah_terkenal": "Ya/Tidak",
        "jumlah_orang": number,
        "ekspresi": "string",
        "brand_karakter_terkenal": "Ya/Tidak",
        "brand_nama": "string[] | []",
        "style": "realistik | stylized | 2D | 3D | pixel art | low-poly",
        "metadata": "EXIF/watermark/software AI/timestamp | -"
      }
    },
    { "id": 2, "Grup_UTAMA": "...", "Sub_Grup": "...", "status_registrasi": "...", "opsi_tambahan": "...", "smart_licensing": "...", "ai_training": "...", "confidence": number, "atribut": { } },
    { "id": 3, "Grup_UTAMA": "...", "Sub_Grup": "...", "status_registrasi": "...", "opsi_tambahan": "...", "smart_licensing": "...", "ai_training": "...", "confidence": number, "atribut": { } },
    { "id": 4, "Grup_UTAMA": "...", "Sub_Grup": "...", "status_registrasi": "...", "opsi_tambahan": "...", "smart_licensing": "...", "ai_training": "...", "confidence": number, "atribut": { } }
  ],
  "hasil_terpilih": {
    "Grup_UTAMA": "1–9",
    "Sub_Grup": "1|2A|2B|3A|3B|4|5A|5B|6A|6B|7|8|9",
    "status_registrasi": "✅ Bisa diregistrasi" | "❌ Tidak diizinkan" | "❌ Tidak langsung diizinkan",
    "opsi_tambahan": "Take Selfie Photo" | "Submit Review" | "-",
    "smart_licensing": "Commercial Remix License (minting fee & revenue share manual)" | "-",
    "ai_training": "✅ Diizinkan" | "❌ Tidak diizinkan (fixed)",
    "confidence": number
  }
}

Jika semua confidence < 0.85, hasil_terpilih tetap isi JSON namun tandai perlu "Review Manual" pada status_registrasi atau opsi_tambahan sesuai.

Tabel klasifikasi (CSV patokan):
Grup_UTAMA,Sub_Grup,Sumber Gambar,Subkategori Sumber,Wajah Manusia,Wajah Full,Wajah Terkenal,Brand/Karakter Terkenal,Jumlah Orang,Animasi/Style,Metadata/Provenance,Status Registrasi IP,Opsi Tambahan,Smart Licensing,AI Training,Confidence
1,1,AI,Realistic/Styled,Tidak,-,-,Tidak,-,-,-,✅ Bisa diregistrasi,-,Commercial Remix License,❌ Tidak diizinkan (fixed),0.9
2,2A,AI,Realistic/Styled,Ya,Ya,Ya,Ya,-,-,-,❌ Tidak diizinkan,Submit Review,-,-,0.95
2,2B,AI,Realistic/Styled,Ya,Tidak,Ya,Ya,-,-,-,✅ Bisa diregistrasi,-,Commercial Remix License,❌ Tidak diizinkan (fixed),0.9
3,3A,AI,Realistic/Styled,Ya,Ya,Tidak,Tidak,1,-,-,❌ Tidak langsung diizinkan,Take Selfie Photo → (Jika sukses ✅, gagal ❌ Submit Review),Commercial Remix License (jika sukses),❌ Tidak diizinkan (fixed),0.85
3,3B,AI,Realistic/Styled,Ya,Tidak,Tidak,Tidak,1,-,-,✅ Bisa diregistrasi,-,Commercial Remix License,❌ Tidak diizinkan (fixed),0.85
4,4,Manusia,Foto/Ilustrasi,Tidak,-,-,Tidak,-,-,Ada EXIF, watermark optional,✅ Bisa diregistrasi,-,Commercial Remix License,✅ Diizinkan (manual),0.9
5,5A,Manusia,Foto/Ilustrasi,Ya,Tidak,Ya,Ya,-,-,Ada EXIF, watermark optional,✅ Bisa diregistrasi,-,Commercial Remix License,✅ Diizinkan (manual),0.9
5,5B,Manusia,Foto/Ilustrasi,Ya,Ya,Ya,Ya,-,-,Ada EXIF, watermark optional,❌ Tidak diizinkan,Submit Review,-,-,0.95
6,6A,Manusia,Foto/Ilustrasi,Ya,Ya,Tidak,Tidak,1,-,Ada EXIF, watermark optional,❌ Tidak langsung diizinkan,Take Selfie Photo → (Jika sukses ✅, gagal ❌ Submit Review),Commercial Remix License (jika sukses),✅ Diizinkan (manual),0.85
6,6B,Manusia,Foto/Ilustrasi,Ya,Tidak,Tidak,Tidak,1,-,Ada EXIF, watermark optional,✅ Bisa diregistrasi,-,Commercial Remix License,✅ Diizinkan (manual),0.85
7,7,AI (Animasi),Cartoon/2D/3D,Tidak,-,-,Tidak,-,2D/3D Cartoon,-,✅ Bisa diregistrasi,-,Commercial Remix License,❌ Tidak diizinkan (fixed),0.9
8,8,AI (Animasi),Cartoon/2D/3D,Ya,Ya/Tidak,Ya,Ya,-,2D/3D Cartoon,-,❌ Tidak diizinkan,Submit Review,-,-,0.95
9,9,AI (Animasi),Cartoon/2D/3D,Ya,Ya/Tidak,Tidak,Tidak,1,2D/3D Cartoon,-,❌ Tidak langsung diizinkan,Take Selfie Photo → (Jika sukses ✅, gagal ❌ Submit Review),Commercial Remix License (jika sukses),❌ Tidak diizinkan (fixed),0.85`;

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
    "presence": "None" | "Partial" | "Ordinary" | "Famous" | "Unknown",
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
  "recommended_answer": string | null, // one of: ${CLASS_CODES.join(", ")}
  "recommended_reason": string | null
}
Rules:
- Fill every field; use null only where schema allows.
- "rationale", "evidence", "ai_artifacts", "human_cues", "overall_notes" are arrays of terse strings.
- "count" must be an integer >=0 or null if unknown.
- "primary_source" must reflect your best hypothesis given evidence.
- If unsure about brands, set present=false and leave names empty.
- If unsure about identities, use "Unknown" presence and empty arrays.
- "recommended_answer" should follow these new groups:
  1 = AI; Tanpa wajah manusia; tanpa brand/karakter terkenal
  2A = AI; Brand/karakter terkenal atau wajah manusia terkenal (full wajah)
  2B = AI; Brand/karakter terkenal atau wajah manusia terkenal (tidak full wajah)
  3A = AI; Wajah manusia biasa (tidak terkenal); full wajah
  3B = AI; Wajah manusia biasa (tidak terkenal); tidak full wajah
  4 = Manusia; Tanpa wajah manusia; tanpa brand/karakter terkenal
  5A = Manusia; Brand/karakter terkenal atau wajah manusia terkenal (tidak full wajah)
  5B = Manusia; Brand/karakter terkenal atau wajah manusia terkenal (full wajah)
  6A = Manusia; Wajah manusia biasa (tidak terkenal); full wajah
  6B = Manusia; Wajah manusia biasa (tidak terkenal); tidak full wajah
  7 = AI (Animasi); Tanpa wajah manusia; tanpa brand/karakter terkenal
  8 = AI (Animasi); Brand/karakter terkenal atau wajah manusia terkenal
  9 = AI (Animasi); Wajah manusia biasa (tidak terkenal)
- Use null if ambiguous.
- "recommended_reason" <= 25 words describing decisive cues.
Return exactly one JSON object.`;

const CLASSIFICATION_GUIDE = `Answer mapping (use these exact codes):
1 = AI; Tanpa wajah manusia; tanpa brand/karakter terkenal
2A = AI; Brand/karakter terkenal atau wajah manusia terkenal (full wajah)
2B = AI; Brand/karakter terkenal atau wajah manusia terkenal (tidak full wajah)
3A = AI; Wajah manusia biasa (tidak terkenal); full wajah
3B = AI; Wajah manusia biasa (tidak terkenal); tidak full wajah
4 = Manusia; Tanpa wajah manusia; tanpa brand/karakter terkenal
5A = Manusia; Brand/karakter terkenal atau wajah manusia terkenal (tidak full wajah)
5B = Manusia; Brand/karakter terkenal atau wajah manusia terkenal (full wajah)
6A = Manusia; Wajah manusia biasa (tidak terkenal); full wajah
6B = Manusia; Wajah manusia biasa (tidak terkenal); tidak full wajah
7 = AI (Animasi); Tanpa wajah manusia; tanpa brand/karakter terkenal
8 = AI (Animasi); Brand/karakter terkenal atau wajah manusia terkenal
9 = AI (Animasi); Wajah manusia biasa (tidak terkenal)`;

const VERDICT_PROMPT_HEADER = `You are a compliance verifier ensuring the image is assigned a single answer using the guide below. Use the stage-1 analysis as facts. Check for inconsistencies before deciding. ${CLASSIFICATION_GUIDE}
Output ONLY one JSON object with keys exactly:
{
  "selected_answer": string|null, // one of: ${CLASS_CODES.join(", ")}
  "reason": string|null,
  "generation_type": "AI generated"|"Human generated"|null,
  "reconstructed_prompt": string|null,
  "decision_notes": string[],
  "consistency_warnings": string[],
  "diagnostics": {
    "face_type": "None"|"Partial"|"Ordinary"|"Famous"|"Unknown"|null,
    "has_brand": boolean|null,
    "is_animation": boolean|null,
    "source_label": "AI"|"Human"|"Animation"|"Unknown"|null,
    "confidence": number|null
  }
}
Rules:
- "reason" must cite decisive evidence in <=20 words.
- Align "generation_type" with selected answer (codes with source AI or AI (Animasi) => "AI generated", Manusia => "Human generated").
- If evidence insufficient, set selected_answer=null, reason="ambiguous", generation_type=null, reconstructed_prompt=null.
- Keep arrays concise (<=4 items each).
- "confidence" is 0-1 or null.
- Provide warnings if stage-1 data conflicts with the mapping.
- If any face is cropped/half/occluded/masked/blurred, set diagnostics.face_type="Partial".`;

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

  let recommendedAnswer: string | null = null;
  if (typeof raw?.recommended_answer === "string") {
    const candidate = raw.recommended_answer.trim().toUpperCase();
    if ((CLASS_CODES as readonly string[]).includes(candidate)) {
      recommendedAnswer = candidate;
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
    const anyReq = req as any;
    let files: {
      buffer: Buffer;
      size: number;
      mimetype: string;
      originalname?: string;
    }[] = [];

    if (anyReq.file) files.push(anyReq.file);
    if (anyReq.files) {
      if (Array.isArray(anyReq.files)) files.push(...anyReq.files);
      else {
        if (Array.isArray(anyReq.files.image)) files.push(...anyReq.files.image);
        if (Array.isArray(anyReq.files.images))
          files.push(...anyReq.files.images);
      }
    }

    if (files.length === 0)
      return res.status(400).json({ error: "No file received" });

    const MAX_ACCEPT = 8 * 1024 * 1024;
    for (const f of files) {
      if (f.size > MAX_ACCEPT)
        return res
          .status(413)
          .json({ error: "file_too_large", maxSize: MAX_ACCEPT });
    }

    const hash = createHash("sha256")
      .update(Buffer.concat(files.map((f) => f.buffer)))
      .digest("hex");
    if (cache.has(hash)) return res.status(200).json(cache.get(hash));

    const dataUrls = files.map(
      (f) => `data:${f.mimetype};base64,${f.buffer.toString("base64")}`,
    );
    const names = files.map((f, i) => f.originalname || `image-${i + 1}`);
    const dataUrl = dataUrls[0]; // primary for single-image fallbacks

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
      maxTokens = 900,
      temperature = 0.1,
      imageUrls?: string[],
    ) => {
      const contents = [
        { type: "input_text", text: prompt } as any,
        ...(
          (imageUrls && imageUrls.length > 0 ? imageUrls : [dataUrl]).map(
            (img) => ({ type: "input_image", image_url: img } as any),
          )
        ),
      ];
      const response = await client.responses.create({
        model,
        temperature,
        input: [
          {
            role: "user",
            content: contents,
          },
        ],
        max_output_tokens: maxTokens,
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

    const tryParseArray = (t: string) => {
      if (!t) return null;
      try {
        const parsed = JSON.parse(t);
        return Array.isArray(parsed) ? parsed : null;
      } catch {
        const m = t.match(/\[[\s\S]*\]/);
        if (m) {
          try {
            const parsed = JSON.parse(m[0]);
            return Array.isArray(parsed) ? parsed : null;
          } catch {
            return null;
          }
        }
        return null;
      }
    };

    const extractCode = (t: string): (typeof CLASS_CODES)[number] | null => {
      if (!t) return null;
      const upper = t.toUpperCase();
      const match = upper.match(/(?:^|[^A-Z0-9])(2A|2B|3A|3B|5A|5B|6A|6B|[14789]|4)(?=$|[^A-Z0-9])/);
      if (!match) return null;
      const code = match[1];
      return (CLASS_CODES as readonly string[]).includes(code as any)
        ? (code as (typeof CLASS_CODES)[number])
        : null;
    };

    // If single image, run 4-scenarios flow first
    if (files.length === 1) {
      const singlePrompt = `${SINGLE_IMAGE_SCENARIOS_PROMPT}\n\nNama file gambar: ${names[0]}`;
      const scen = await callModel(
        "scenarios",
        singlePrompt,
        PRIMARY_MODEL,
        1600,
        0,
        [dataUrl],
      );
      const scenObj = tryParseJson(scen.text);
      if (scenObj && typeof scenObj === "object" && Array.isArray(scenObj.skenario)) {
        const pick = scenObj.hasil_terpilih || null;
        const pickSub = pick?.Sub_Grup ? String(pick.Sub_Grup).toUpperCase() : null;
        const code = (CLASS_CODES as readonly string[]).includes(pickSub as any)
          ? (pickSub as (typeof CLASS_CODES)[number])
          : null;
        const normalized = code
          ? {
              selected_answer: code,
              reason: "Hasil_terpilih dari skenario paralel.",
              generation_type: generationTypeFor(code),
              reconstructed_prompt: null,
              analysis: {
                scene_summary: "",
                source_primary: "Unknown" as const,
                source_scores: { ai: null, human: null, animation: null },
                faces_presence: "Unknown" as const,
                faces_count: null,
                faces_evidence: [],
                brand_present: null,
                brand_names: [],
                brand_evidence: [],
                animation_is: null,
                animation_evidence: [],
                ai_artifacts: [],
                human_cues: [],
                overall_notes: [],
                recommended_answer: code,
                recommended_reason: null,
                raw: null,
              },
              analysis_issues: ["scenarios_mode_used"],
              verdict_details: extractVerdictExtras({}),
              _analysis_raw_output: null,
              _verdict_raw_output: null,
              _raw_model_output: scen.text ?? "",
              _timestamp: new Date().toISOString(),
              _validation_issues: [],
              _allowed_codes: CLASS_CODES,
            }
          : null;

        const out = {
          parsed: normalized,
          parsed_scenarios: scenObj,
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
      }
    }

    // Batch attempt (works for 1 atau banyak gambar)
    const namesList = names.map((n, i) => `${i + 1}. ${n}`).join("\n");
    const batchPrompt = `${MULTI_IMAGE_PROMPT}\n\nDaftar nama file:\n${namesList}`;
    const batch = await callModel(
      "batch",
      batchPrompt,
      PRIMARY_MODEL,
      1400,
      0,
      dataUrls,
    );
    const batchParsed = tryParseArray(batch.text);
    if (batchParsed && Array.isArray(batchParsed) && batchParsed.length > 0) {
      // Derive single-image normalized for compatibility if hanya satu gambar
      let normalized: any | null = null;
      const first = batchParsed[0] || null;
      const sub = (first?.Sub_Grup || first?.sub_grup || first?.subGroup || "")
        .toString()
        .trim()
        .toUpperCase();
      const code = (CLASS_CODES as readonly string[]).includes(sub as any)
        ? (sub as (typeof CLASS_CODES)[number])
        : null;
      if (code) {
        normalized = {
          selected_answer: code,
          reason: `Batch classification (confidence ${
            typeof first?.confidence === "number" ? first.confidence : "n/a"
          }).`,
          generation_type: generationTypeFor(code),
          reconstructed_prompt: null,
          analysis: {
            scene_summary: "",
            source_primary: "Unknown" as const,
            source_scores: { ai: null, human: null, animation: null },
            faces_presence: "Unknown" as const,
            faces_count: null,
            faces_evidence: [],
            brand_present: null,
            brand_names: [],
            brand_evidence: [],
            animation_is: null,
            animation_evidence: [],
            ai_artifacts: [],
            human_cues: [],
            overall_notes: [],
            recommended_answer: code,
            recommended_reason: null,
            raw: null,
          },
          analysis_issues: ["batch_mode_used"],
          verdict_details: extractVerdictExtras({}),
          _analysis_raw_output: null,
          _verdict_raw_output: null,
          _raw_model_output: batch.text ?? "",
          _timestamp: new Date().toISOString(),
          _validation_issues: [],
          _allowed_codes: CLASS_CODES,
        };
      }

      const out = {
        parsed: normalized,
        parsed_batch: batchParsed,
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
    }

    const simple = await callModel(
      "simple",
      SIMPLE_CLASSIFY_PROMPT,
      PRIMARY_MODEL,
      8,
      0,
    );
    const simpleCode = extractCode(simple.text);
    if (simpleCode) {
      const normalized = {
        selected_answer: simpleCode,
        reason: "Klasifikasi langsung via prompt sederhana.",
        generation_type: generationTypeFor(simpleCode),
        reconstructed_prompt: null,
        analysis: {
          scene_summary: "",
          source_primary: "Unknown" as const,
          source_scores: { ai: null, human: null, animation: null },
          faces_presence: "Unknown" as const,
          faces_count: null,
          faces_evidence: [],
          brand_present: null,
          brand_names: [],
          brand_evidence: [],
          animation_is: null,
          animation_evidence: [],
          ai_artifacts: [],
          human_cues: [],
          overall_notes: [],
          recommended_answer: simpleCode,
          recommended_reason: null,
          raw: null,
        },
        analysis_issues: ["simple_mode_used"],
        verdict_details: extractVerdictExtras({}),
        _analysis_raw_output: null,
        _verdict_raw_output: null,
        _raw_model_output: simple.text ?? "",
        _timestamp: new Date().toISOString(),
        _validation_issues: [],
        _allowed_codes: CLASS_CODES,
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
    }

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
        selected_answer: null as null | (typeof CLASS_CODES)[number],
        reason: null as null | string,
        generation_type: null as null | "AI generated" | "Human generated",
        reconstructed_prompt: null as null | string,
      };

      if (!rawParsed || typeof rawParsed !== "object") {
        issues.push("parsed_not_object");
        return { out, issues, extras: extractVerdictExtras({}) };
      }

      const sa = rawParsed.selected_answer;
      if (sa === null || sa === undefined) {
        out.selected_answer = null;
        issues.push("selected_answer_missing");
      } else if (typeof sa === "string") {
        const candidate = sa.trim().toUpperCase();
        if ((CLASS_CODES as readonly string[]).includes(candidate)) {
          out.selected_answer = candidate as (typeof CLASS_CODES)[number];
        } else {
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
        const expectedGen = generationTypeFor(out.selected_answer);
        if (expectedGen && out.generation_type !== expectedGen) {
          issues.push("generation_type_mismatch_with_answer");
          out.generation_type = expectedGen;
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
      _allowed_codes: CLASS_CODES,
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

export const handleAnalyze: any = [
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "images", maxCount: 12 },
  ]),
  analyzeHandler,
];
