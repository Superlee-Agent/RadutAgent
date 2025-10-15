export type LicenseSettings = {
  pilType: "commercial_remix";
  aiLearning: boolean;
  licensePrice: number; // in native units or USD-equivalent depending on chain integration
  revShare: number; // percentage (0-100)
};

export const DEFAULT_LICENSE_SETTINGS: LicenseSettings = {
  pilType: "commercial_remix",
  aiLearning: false,
  licensePrice: 0,
  revShare: 0,
};

// Shape compatible with Story Protocol terms generator expectations (logical placeholder for SDK integration)
export function createLicenseTerms(settings: LicenseSettings) {
  return {
    pilType: settings.pilType,
    terms: {
      aiTrainingAllowed: !!settings.aiLearning,
      licensePrice: Number(settings.licensePrice) || 0,
      revSharePercent: Number(settings.revShare) || 0,
    },
  } as const;
}
