export type InputStruct = {
  source: "AI" | "Human";
  isAnimation: boolean;
  faceType: "None" | "Ordinary" | "Famous";
  hasBrand: boolean;
  conf_source: number;
  conf_animation: number;
  conf_face: number;
  conf_brand: number;
};

export const RECOMMENDATIONS: Record<string, string> = {
  "Jawaban 1": "Lisensi Bebas Pakai (Free Use License)",
  "Jawaban 2": "Creative Commons – Attribution (CC BY)",
  "Jawaban 3": "Creative Commons – Non-Commercial (CC BY-NC)",
  "Jawaban 4": "Creative Commons – No Derivatives (CC BY-ND)",
  "Jawaban 5": "Creative Commons – ShareAlike (CC BY-SA)",
  "Jawaban 6": "License for Editorial Use Only",
  "Jawaban 7": "License with Brand Review Required",
  "Jawaban 8": "Lisensi Khusus – Hubungi Pemilik",
  "Jawaban 9": "Royalty-Free Image, Attribution Required",
  "Jawaban 10": "Public Domain (Bebas Hak Cipta)",
  "Jawaban 11": "License for Internal/Research Only",
  "Jawaban 12": "NOT FOR COMMERCIAL USE (Non-Komersial)",
};

export function deterministicRouter(input: InputStruct): string {
  const { source, isAnimation, faceType, hasBrand } = input;

  // Deterministic mapping that always returns one of Jawaban 1..12
  if (hasBrand === true || faceType === "Famous") {
    if (source === "AI" && isAnimation) return "Jawaban 8";
    if (source === "AI" && !isAnimation) return "Jawaban 2";
    if (source === "Human" && isAnimation) return "Jawaban 11";
    return "Jawaban 5"; // Human && !isAnimation
  }

  if (faceType === "Ordinary") {
    if (source === "AI" && isAnimation) return "Jawaban 9";
    if (source === "AI" && !isAnimation) return "Jawaban 3";
    if (source === "Human" && isAnimation) return "Jawaban 12";
    return "Jawaban 6"; // Human && !isAnimation
  }

  // faceType === "None" && hasBrand === false
  if (source === "AI" && isAnimation) return "Jawaban 7";
  if (source === "AI" && !isAnimation) return "Jawaban 1";
  if (source === "Human" && isAnimation) return "Jawaban 10";
  return "Jawaban 4"; // Human && !isAnimation
}
