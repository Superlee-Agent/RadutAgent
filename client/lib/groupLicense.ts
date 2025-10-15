import { LicenseSettings, DEFAULT_LICENSE_SETTINGS } from "@/lib/license/terms";

export const GROUPS = {
  SELFIE_REQUIRED: [5, 10],
  SUBMIT_REVIEW: [2, 3, 7, 8, 13, 15],
  DIRECT_REGISTER_FIXED_AI: [1, 4, 6, 12],
  DIRECT_REGISTER_MANUAL_AI: [9, 11, 14],
};

export function getLicenseSettingsByGroup(
  group: number,
  aiTrainingManual?: boolean,
  mintingFee?: number,
  revShare?: number,
): LicenseSettings | null {
  if (GROUPS.DIRECT_REGISTER_FIXED_AI.includes(group)) {
    return {
      ...DEFAULT_LICENSE_SETTINGS,
      pilType: "commercial_remix",
      aiLearning: false,
      licensePrice: mintingFee ?? 0,
      revShare: revShare ?? 0,
    };
  }

  if (GROUPS.DIRECT_REGISTER_MANUAL_AI.includes(group)) {
    return {
      ...DEFAULT_LICENSE_SETTINGS,
      pilType: "commercial_remix",
      aiLearning: aiTrainingManual ?? true,
      licensePrice: mintingFee ?? 0,
      revShare: revShare ?? 0,
    };
  }

  if (
    GROUPS.SELFIE_REQUIRED.includes(group) ||
    GROUPS.SUBMIT_REVIEW.includes(group)
  ) {
    return null;
  }

  return null;
}

export function requiresSelfieVerification(group: number) {
  return GROUPS.SELFIE_REQUIRED.includes(group);
}

export function requiresSubmitReview(group: number) {
  return GROUPS.SUBMIT_REVIEW.includes(group);
}

export function isAiGeneratedGroup(group: number) {
  // Based on determineGroup mapping in server/routes/upload.ts
  return [1, 2, 3, 4, 5, 6, 12, 13].includes(group);
}
