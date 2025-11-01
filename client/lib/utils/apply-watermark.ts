import { embedWatermark, type WatermarkData } from "./watermark";

/**
 * Apply watermark to an IP asset image
 * Embeds invisible metadata about the IP
 */
export async function applyIpWatermark(
  imageBlob: Blob,
  ipData: {
    ipId: string;
    title?: string;
    licenseTermsId?: string;
    metadata?: Record<string, any>;
  },
): Promise<Blob> {
  try {
    // Create watermark data
    const watermarkData: WatermarkData = {
      ipId: ipData.ipId,
      licenseTerms: ipData.licenseTermsId || "standard",
      copyrightInfo: `Original IP: ${ipData.title || ipData.ipId}`,
      metadata: {
        originalTitle: ipData.title,
        licenseTermsId: ipData.licenseTermsId,
        ...ipData.metadata,
      },
      timestamp: Date.now(),
    };

    // Embed watermark into image
    const watermarkedBlob = await embedWatermark(imageBlob, watermarkData);
    return watermarkedBlob;
  } catch (error) {
    console.error("Failed to apply watermark:", error);
    // Return original blob if watermarking fails
    return imageBlob;
  }
}

/**
 * Create watermark from search result asset
 */
export async function applyWatermarkFromAsset(
  imageBlob: Blob,
  asset: any,
): Promise<Blob> {
  return applyIpWatermark(imageBlob, {
    ipId: asset.ipId || "unknown",
    title: asset.title || asset.name,
    licenseTermsId: asset.licenseTermsIds?.[0],
    metadata: {
      assetType: asset.mediaType || "image",
      creator: asset.creator,
      owner: asset.ownerAddress,
      isDerivative: asset.isDerivative || false,
    },
  });
}
