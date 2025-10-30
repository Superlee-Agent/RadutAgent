export const ANSWER_DETAILS: Record<
  string,
  {
    type: string;
    notes: string;
    registrationStatus: string;
    action: string;
    smartLicensing: string;
    aiTraining: string;
  }
> = {
  "1": {
    type: "AI Generated",
    notes: "AI-generated image; No human face; No famous brand/character",
    registrationStatus: "✅ IP can be registered",
    action: "-",
    smartLicensing:
      "Commercial Remix License (manual minting fee & revenue share)",
    aiTraining: "❌ Not allowed (fixed)",
  },
  "2": {
    type: "AI Generated",
    notes: "AI-generated image; Contains famous brand/character",
    registrationStatus: "❌ IP cannot be registered",
    action: "Submit Review",
    smartLicensing: "-",
    aiTraining: "-",
  },
  "3": {
    type: "AI Generated",
    notes: "AI-generated image; Famous person's face; full face visible",
    registrationStatus: "❌ IP cannot be registered",
    action: "Submit Review",
    smartLicensing: "-",
    aiTraining: "-",
  },
  "4": {
    type: "AI Generated",
    notes:
      "AI-generated image; Famous person's face; not fully visible (cropped)",
    registrationStatus: "✅ IP can be registered",
    action: "-",
    smartLicensing:
      "Commercial Remix License (manual minting fee & revenue share)",
    aiTraining: "❌ Not allowed (fixed)",
  },
  "5": {
    type: "AI Generated",
    notes:
      "AI-generated image; Regular person's face (not famous); full face visible",
    registrationStatus: "��� Cannot be registered directly",
    action:
      "Take Selfie Photo → If selfie verification succeeds: IP can be registered; if it fails: Submit Review",
    smartLicensing:
      "Commercial Remix License (manual minting fee & revenue share)  — if verification succeeds",
    aiTraining: "❌ Not allowed (fixed)",
  },
  "6": {
    type: "AI Generated",
    notes:
      "Gambar hasil AI; Wajah orang biasa (tidak terkenal); wajah tidak terlihat full (tercrop)",
    registrationStatus: "✅ IP can be registered",
    action: "-",
    smartLicensing:
      "Commercial Remix License (manual minting fee & revenue share)",
    aiTraining: "❌ Not allowed (fixed)",
  },
  "7": {
    type: "Human Generated",
    notes: "Original non-AI image; Contains famous brand/character",
    registrationStatus: "❌ IP cannot be registered",
    action: "Submit Review",
    smartLicensing: "-",
    aiTraining: "-",
  },
  "8": {
    type: "Human Generated",
    notes: "Original non-AI image; Famous person's face; full face visible",
    registrationStatus: "❌ IP cannot be registered",
    action: "Submit Review",
    smartLicensing: "-",
    aiTraining: "-",
  },
  "9": {
    type: "Human Generated",
    notes:
      "Original non-AI image; Famous person's face; not fully visible (cropped)",
    registrationStatus: "✅ IP can be registered",
    action: "-",
    smartLicensing:
      "Commercial Remix License (manual minting fee & revenue share)",
    aiTraining: "���� Allowed (user-configurable)",
  },
  "10": {
    type: "Human Generated",
    notes:
      "Original non-AI image; Regular person's face (not famous); full face visible",
    registrationStatus: "❌ Cannot be registered directly",
    action:
      "Take Selfie Photo → If selfie verification succeeds: IP can be registered; if it fails: Submit Review",
    smartLicensing:
      "Commercial Remix License (manual minting fee & revenue share)  ��� if verification succeeds",
    aiTraining: "✅ Allowed (user-configurable)",
  },
  "11": {
    type: "Human Generated",
    notes:
      "Original non-AI image; Regular person's face (not famous); not fully visible (cropped)",
    registrationStatus: "✅ IP can be registered",
    action: "-",
    smartLicensing:
      "Commercial Remix License (manual minting fee & revenue share)",
    aiTraining: "✅ Allowed (user-configurable)",
  },
  "12": {
    type: "AI Generated (Animation)",
    notes: "AI-generated 2D/3D animation; No famous brand/character",
    registrationStatus: "✅ IP can be registered",
    action: "-",
    smartLicensing:
      "Commercial Remix License (manual minting fee & revenue share)",
    aiTraining: "❌ Not allowed (fixed)",
  },
  "13": {
    type: "AI Generated (Animation)",
    notes: "AI-generated 2D/3D animation; Contains famous brand/character",
    registrationStatus: "❌ IP cannot be registered",
    action: "Submit Review",
    smartLicensing: "-",
    aiTraining: "-",
  },
  "14": {
    type: "Human Generated (Animation)",
    notes: "Original non-AI 2D/3D animation; No famous brand/character",
    registrationStatus: "✅ IP can be registered",
    action: "-",
    smartLicensing:
      "Commercial Remix License (manual minting fee & revenue share)",
    aiTraining: "✅ Allowed (user-configurable)",
  },
  "15": {
    type: "Human Generated (Animation)",
    notes: "Original non-AI 2D/3D animation; Contains famous brand/character",
    registrationStatus: "❌ IP cannot be registered",
    action: "Submit Review",
    smartLicensing: "-",
    aiTraining: "-",
  },
};
