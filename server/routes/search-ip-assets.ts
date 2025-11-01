import { RequestHandler } from "express";

const PINATA_GATEWAY = process.env.PINATA_GATEWAY;

async function fetchParentIpDetails(
  childIpId: string,
  apiKey: string,
): Promise<any> {
  try {
    const response = await fetch(
      "https://api.storyapis.com/api/v4/assets/edges",
      {
        method: "POST",
        headers: {
          "X-Api-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          where: {
            childIpId: childIpId,
          },
          pagination: {
            limit: 100,
            offset: 0,
          },
        }),
      },
    );

    if (!response.ok) {
      console.warn(
        `Failed to fetch parent details for ${childIpId}: ${response.status}`,
      );
      return null;
    }

    const data = await response.json();
    if (!Array.isArray(data.data) || data.data.length === 0) {
      return null;
    }

    const edges = data.data;
    return {
      parentIpIds: edges.map((edge: any) => edge.parentIpId),
      licenseTermsIds: edges.map((edge: any) => edge.licenseTermsId),
      licenseTemplates: edges.map((edge: any) => edge.licenseTemplate),
      edges: edges,
    };
  } catch (error) {
    console.warn(`Error fetching parent details for ${childIpId}:`, error);
    return null;
  }
}

function convertIpfsUriToHttp(uri: string): string {
  if (!uri) return uri;

  // Use dweb.link (reliable public IPFS gateway) instead of private Pinata
  // Private Pinata gateway returns 403 for files not pinned on that account
  const PUBLIC_GATEWAY = "dweb.link";

  // Extract CID from various IPFS formats
  if (uri.startsWith("ipfs://")) {
    const cid = uri.replace("ipfs://", "");
    return `https://${PUBLIC_GATEWAY}/ipfs/${cid}`;
  }

  // Replace ipfs.io with dweb.link for better reliability
  if (uri.includes("ipfs.io/ipfs/")) {
    const cid = uri.split("/ipfs/")[1];
    return `https://${PUBLIC_GATEWAY}/ipfs/${cid}`;
  }

  // Don't convert Pinata URLs that are already there (they may work)
  if (uri.includes("mypinata.cloud")) {
    return uri;
  }

  // Replace any other IPFS gateway with dweb.link
  if (uri.includes("/ipfs/") && !uri.includes(PUBLIC_GATEWAY)) {
    const cid = uri.split("/ipfs/")[1];
    return `https://${PUBLIC_GATEWAY}/ipfs/${cid}`;
  }

  return uri;
}

async function fetchIpaMetadata(ipaMetadataUri: string): Promise<any> {
  if (!ipaMetadataUri) return null;

  try {
    let url = ipaMetadataUri;

    // Convert ipfs:// URIs to HTTP gateways
    if (url.startsWith("ipfs://")) {
      const cid = url.replace("ipfs://", "");
      // Try Pinata gateway first if available, then fall back to ipfs.io
      url = PINATA_GATEWAY
        ? `https://${PINATA_GATEWAY}/ipfs/${cid}`
        : `https://ipfs.io/ipfs/${cid}`;
    }

    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      console.warn(
        `Failed to fetch IPA metadata from ${url}: ${response.status}`,
      );
      return null;
    }

    const metadata = await response.json();
    return metadata;
  } catch (error) {
    console.warn(`Error fetching IPA metadata from ${ipaMetadataUri}:`, error);
    return null;
  }
}

export const handleSearchIpAssets: RequestHandler = async (req, res) => {
  try {
    const { query, mediaType } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({
        ok: false,
        error: "query_required",
        message: "Search query is required",
      });
    }

    // Validate mediaType if provided
    const validMediaTypes = ["image", "video", "audio"];
    const finalMediaType =
      mediaType && validMediaTypes.includes(mediaType) ? mediaType : null;

    const apiKey = process.env.STORY_API_KEY;
    if (!apiKey) {
      console.error("STORY_API_KEY environment variable not configured");
      return res.status(500).json({
        ok: false,
        error: "server_config_missing",
        message: "Server configuration error: STORY_API_KEY not set",
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      console.log("[Search IP] Searching for:", query);

      const searchBody: any = {
        query: query.trim(),
        pagination: {
          limit: 50,
          offset: 0,
        },
      };

      if (finalMediaType) {
        searchBody.mediaType = finalMediaType;
      }

      const response = await fetch("https://api.storyapis.com/api/v4/search", {
        method: "POST",
        headers: {
          "X-Api-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(searchBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Story API Error: ${response.status} - ${errorText}`, {
          query,
        });

        let errorDetail = errorText;
        try {
          const errorJson = JSON.parse(errorText);
          errorDetail = errorJson.message || errorJson.error || errorText;
        } catch {
          // Keep the raw text if not JSON
        }

        return res.status(response.status).json({
          ok: false,
          error: `story_api_error`,
          details: errorDetail,
          status: response.status,
        });
      }

      const data = await response.json();

      console.log(
        "[Search IP] Full search API response:",
        JSON.stringify(data, null, 2),
      );
      console.log("[Search IP] Response data:", {
        totalResults: data?.total,
        resultsCount: data?.data?.length,
        hasMore: data?.pagination?.hasMore,
      });

      if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
        console.log(
          "[Search IP] First search result sample:",
          JSON.stringify(data.data[0], null, 2),
        );
      }

      if (!data) {
        return res.json({
          ok: true,
          results: [],
          message: "No response from API",
        });
      }

      const searchResults = Array.isArray(data.data) ? data.data : [];

      // Fetch detailed metadata for search results to get image URLs
      let enrichedResults = searchResults;

      if (searchResults.length > 0) {
        // Helper function to detect if URL points to a video
        const isVideoUrl = (url: string): boolean => {
          if (!url) return false;
          const videoExtensions = [
            ".mp4",
            ".webm",
            ".mov",
            ".avi",
            ".mkv",
            ".flv",
            ".wmv",
            ".m4v",
            ".3gp",
          ];
          const lowerUrl = url.toLowerCase();
          return videoExtensions.some((ext) => lowerUrl.includes(ext));
        };

        // Helper function to check Content-Type header for video
        const checkContentType = async (url: string): Promise<boolean> => {
          try {
            const response = await fetch(url, {
              method: "HEAD",
              signal: AbortSignal.timeout(5000),
            });
            const contentType = response.headers.get("content-type") || "";
            return contentType.startsWith("video/");
          } catch {
            return false;
          }
        };

        try {
          const ipIds = searchResults
            .slice(0, 20)
            .map((r: any) => r.ipId)
            .filter(Boolean);

          if (ipIds.length > 0) {
            const metadataResponse = await fetch(
              "https://api.storyapis.com/api/v4/assets",
              {
                method: "POST",
                headers: {
                  "X-Api-Key": apiKey,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  includeLicenses: true,
                  where: {
                    ipIds,
                  },
                  pagination: {
                    limit: 20,
                    offset: 0,
                  },
                }),
                signal: controller.signal,
              },
            );

            if (metadataResponse.ok) {
              const metadataData = await metadataResponse.json();
              const metadataMap = new Map();

              console.log(
                "[Search IP] Full metadata API response:",
                JSON.stringify(metadataData, null, 2).substring(0, 2000),
              );

              if (Array.isArray(metadataData.data)) {
                metadataData.data.forEach((asset: any) => {
                  console.log(
                    `[Search IP] Asset ${asset.ipId} full data:`,
                    JSON.stringify(asset, null, 2).substring(0, 1000),
                  );
                  metadataMap.set(asset.ipId, asset);
                });
              }

              enrichedResults = await Promise.all(
                searchResults.map(async (result: any) => {
                  const metadata = metadataMap.get(result.ipId);

                  // Determine if asset is derivative by checking parentsCount
                  const parentsCount = metadata?.parentsCount || 0;
                  const isDerivative = parentsCount > 0;

                  console.log(
                    `[Search IP] Asset ${result.ipId} - parentsCount:`,
                    parentsCount,
                    ", isDerivative:",
                    isDerivative,
                  );

                  // Fetch parent IP details for derivative assets
                  let parentIpDetails = null;
                  if (isDerivative) {
                    parentIpDetails = await fetchParentIpDetails(
                      result.ipId,
                      apiKey,
                    );
                    if (parentIpDetails) {
                      console.log(
                        `[Search IP] Fetched parent details for ${result.ipId}:`,
                        parentIpDetails,
                      );
                    }
                  }

                  // Determine media type from result or metadata
                  let mediaType =
                    result?.mediaType || metadata?.mediaType || "image";

                  // Get media URL - try multiple sources based on media type
                  let mediaUrl = null;
                  let thumbnailUrl = null;

                  if (mediaType === "image" || mediaType === "animation") {
                    // Try image object first (highest priority)
                    if (metadata?.image?.cachedUrl) {
                      mediaUrl = metadata.image.cachedUrl;
                    } else if (metadata?.image?.pngUrl) {
                      mediaUrl = metadata.image.pngUrl;
                    } else if (metadata?.image?.thumbnailUrl) {
                      mediaUrl = metadata.image.thumbnailUrl;
                    } else if (metadata?.image?.originalUrl) {
                      mediaUrl = metadata.image.originalUrl;
                    }

                    // Try NFT metadata sources
                    if (!mediaUrl) {
                      if (metadata?.nftMetadata?.image?.cachedUrl) {
                        mediaUrl = metadata.nftMetadata.image.cachedUrl;
                      } else if (metadata?.nftMetadata?.image?.pngUrl) {
                        mediaUrl = metadata.nftMetadata.image.pngUrl;
                      } else if (
                        metadata?.nftMetadata?.contract?.openSeaMetadata
                          ?.imageUrl
                      ) {
                        mediaUrl =
                          metadata.nftMetadata.contract.openSeaMetadata
                            .imageUrl;
                      }
                    }
                  } else if (mediaType === "video") {
                    // Try video/animation URLs
                    if (metadata?.nftMetadata?.animation?.cachedUrl) {
                      mediaUrl = metadata.nftMetadata.animation.cachedUrl;
                    } else if (metadata?.nftMetadata?.animation?.originalUrl) {
                      mediaUrl = metadata.nftMetadata.animation.originalUrl;
                    } else if (metadata?.image?.cachedUrl) {
                      // Fallback to image if no video
                      mediaUrl = metadata.image.cachedUrl;
                    }
                    // Get thumbnail for video
                    if (metadata?.image?.cachedUrl) {
                      thumbnailUrl = metadata.image.cachedUrl;
                    } else if (metadata?.image?.thumbnailUrl) {
                      thumbnailUrl = metadata.image.thumbnailUrl;
                    }
                  } else if (mediaType === "audio") {
                    // Try audio URLs
                    if (metadata?.nftMetadata?.animation?.cachedUrl) {
                      mediaUrl = metadata.nftMetadata.animation.cachedUrl;
                    } else if (metadata?.nftMetadata?.animation?.originalUrl) {
                      mediaUrl = metadata.nftMetadata.animation.originalUrl;
                    }
                    // Get thumbnail for audio
                    if (metadata?.image?.cachedUrl) {
                      thumbnailUrl = metadata.image.cachedUrl;
                    } else if (metadata?.image?.thumbnailUrl) {
                      thumbnailUrl = metadata.image.thumbnailUrl;
                    }
                  }

                  // Try raw metadata if available
                  if (!mediaUrl && metadata?.nftMetadata?.raw?.image) {
                    mediaUrl = metadata.nftMetadata.raw.image;
                  }

                  // If still no media URL, try fetching from IPA metadata URI
                  if (!mediaUrl && metadata?.ipaMetadataUri) {
                    const ipaMetadata = await fetchIpaMetadata(
                      metadata.ipaMetadataUri,
                    );
                    if (ipaMetadata) {
                      // Try to extract media URL from IPA metadata based on media type
                      if (mediaType === "video") {
                        // For videos, try animation-related fields first
                        if (ipaMetadata.animation) {
                          mediaUrl = convertIpfsUriToHttp(
                            ipaMetadata.animation,
                          );
                        } else if (ipaMetadata.animationUrl) {
                          mediaUrl = convertIpfsUriToHttp(
                            ipaMetadata.animationUrl,
                          );
                        } else if (ipaMetadata.video) {
                          mediaUrl = convertIpfsUriToHttp(ipaMetadata.video);
                        } else if (ipaMetadata.videoUrl) {
                          mediaUrl = convertIpfsUriToHttp(ipaMetadata.videoUrl);
                        } else if (ipaMetadata.mediaUrl) {
                          mediaUrl = convertIpfsUriToHttp(ipaMetadata.mediaUrl);
                        } else if (
                          ipaMetadata.media &&
                          Array.isArray(ipaMetadata.media) &&
                          ipaMetadata.media.length > 0
                        ) {
                          mediaUrl = convertIpfsUriToHttp(ipaMetadata.media[0]);
                        }
                      } else if (mediaType === "audio") {
                        // For audio, try audio-related fields first
                        if (ipaMetadata.audio) {
                          mediaUrl = convertIpfsUriToHttp(ipaMetadata.audio);
                        } else if (ipaMetadata.audioUrl) {
                          mediaUrl = convertIpfsUriToHttp(ipaMetadata.audioUrl);
                        } else if (ipaMetadata.animation) {
                          mediaUrl = convertIpfsUriToHttp(
                            ipaMetadata.animation,
                          );
                        } else if (ipaMetadata.animationUrl) {
                          mediaUrl = convertIpfsUriToHttp(
                            ipaMetadata.animationUrl,
                          );
                        } else if (ipaMetadata.mediaUrl) {
                          mediaUrl = convertIpfsUriToHttp(ipaMetadata.mediaUrl);
                        } else if (
                          ipaMetadata.media &&
                          Array.isArray(ipaMetadata.media) &&
                          ipaMetadata.media.length > 0
                        ) {
                          mediaUrl = convertIpfsUriToHttp(ipaMetadata.media[0]);
                        }
                      } else {
                        // For images and other types
                        if (ipaMetadata.mediaUrl) {
                          mediaUrl = convertIpfsUriToHttp(ipaMetadata.mediaUrl);
                        } else if (ipaMetadata.image) {
                          mediaUrl = convertIpfsUriToHttp(ipaMetadata.image);
                        } else if (ipaMetadata.animationUrl) {
                          mediaUrl = convertIpfsUriToHttp(
                            ipaMetadata.animationUrl,
                          );
                        } else if (
                          ipaMetadata.media &&
                          Array.isArray(ipaMetadata.media) &&
                          ipaMetadata.media.length > 0
                        ) {
                          mediaUrl = convertIpfsUriToHttp(ipaMetadata.media[0]);
                        }
                      }

                      // Try to get thumbnail from IPA metadata
                      if (!thumbnailUrl) {
                        if (ipaMetadata.thumbnailUrl) {
                          thumbnailUrl = convertIpfsUriToHttp(
                            ipaMetadata.thumbnailUrl,
                          );
                        } else if (ipaMetadata.image) {
                          thumbnailUrl = convertIpfsUriToHttp(
                            ipaMetadata.image,
                          );
                        } else if (ipaMetadata.thumbnail) {
                          thumbnailUrl = convertIpfsUriToHttp(
                            ipaMetadata.thumbnail,
                          );
                        }
                      }

                      console.log(
                        `[Search IP] Extracted from IPA metadata for ${result.ipId}:`,
                        {
                          mediaType,
                          mediaUrl: mediaUrl || "not found",
                          thumbnailUrl: thumbnailUrl || "not found",
                        },
                      );
                    }
                  }

                  // Fallback: detect if URL is actually a video despite API classification
                  if (mediaUrl && !mediaType?.startsWith("video")) {
                    if (isVideoUrl(mediaUrl)) {
                      mediaType = "video/mp4"; // Set as video type based on extension
                      console.log(
                        `[Search IP] Auto-detected video for ${result.ipId} from URL extension: ${mediaUrl}`,
                      );
                    } else {
                      // Check Content-Type header as additional fallback
                      const isVideo = await checkContentType(mediaUrl);
                      if (isVideo) {
                        mediaType = "video/mp4";
                        console.log(
                          `[Search IP] Auto-detected video for ${result.ipId} from Content-Type: ${mediaUrl}`,
                        );
                      }
                    }
                  }

                  // Extract license details from metadata
                  const licenseDetails = metadata?.licenses?.[0]
                    ? {
                        licenseTermsIds: metadata.licenses.map(
                          (l: any) => l.licenseTermsId,
                        ),
                        licenseTemplates: metadata.licenses.map(
                          (l: any) => l.licenseTemplate,
                        ),
                        royaltyContext: metadata.licenses[0]?.royaltyContext,
                        maxMintingFee: metadata.licenses[0]?.maxMintingFee,
                        maxRts: metadata.licenses[0]?.maxRts,
                        maxRevenueShare: metadata.licenses[0]?.maxRevenueShare,
                        licenseVisibility:
                          metadata.licenses[0]?.licenseVisibility,
                      }
                    : {};

                  return {
                    ...result,
                    mediaUrl: mediaUrl || null,
                    mediaType: mediaType,
                    thumbnailUrl: thumbnailUrl,
                    ipaMetadataUri: metadata?.ipaMetadataUri,
                    ownerAddress: metadata?.ownerAddress,
                    lastUpdatedAt: metadata?.lastUpdatedAt,
                    isDerivative: isDerivative,
                    parentsCount: parentsCount,
                    // Flatten parent IP details to root level
                    parentIpIds: parentIpDetails?.parentIpIds,
                    parentIpDetails: parentIpDetails || undefined,
                    licenses: metadata?.licenses || [],
                    licenseTermsIds:
                      parentIpDetails?.licenseTermsIds ||
                      licenseDetails.licenseTermsIds,
                    licenseTemplates:
                      parentIpDetails?.licenseTemplates ||
                      licenseDetails.licenseTemplates,
                    royaltyContext: licenseDetails.royaltyContext,
                    maxMintingFee: licenseDetails.maxMintingFee,
                    maxRts: licenseDetails.maxRts,
                    maxRevenueShare: licenseDetails.maxRevenueShare,
                    licenseVisibility: licenseDetails.licenseVisibility,
                  };
                }),
              );

              console.log(
                `[Search IP] Enriched ${enrichedResults.length} results with metadata (${enrichedResults.filter((r: any) => r.imageUrl).length} with images)`,
              );
            } else {
              console.warn(
                `[Search IP] Failed to fetch enriched metadata (${metadataResponse.status}), using search results only`,
              );
            }
          }
        } catch (metadataError) {
          console.warn(
            "[Search IP] Error fetching metadata, using search results only:",
            metadataError,
          );
        }
      }

      res.json({
        ok: true,
        results: enrichedResults,
        totalSearched: data?.pagination?.total || enrichedResults.length,
        pagination: data?.pagination,
        message: `Found ${enrichedResults.length} IP assets matching "${query}"`,
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);

      if (fetchError.name === "AbortError") {
        console.error("Request timeout while searching IP assets", {
          query,
        });
        return res.status(504).json({
          ok: false,
          error: "timeout",
          details: "The Story API is responding slowly. Please try again.",
        });
      }

      console.error("Fetch request failed for Story API", {
        query,
        error: fetchError?.message,
      });
      return res.status(500).json({
        ok: false,
        error: "network_error",
        details: fetchError?.message || "Unable to connect to Story API",
      });
    }
  } catch (error: any) {
    console.error("Search IP Assets Error:", error);
    res.status(500).json({
      ok: false,
      error: error?.message || "Internal server error",
      details:
        process.env.NODE_ENV !== "production"
          ? error?.stack
          : "An unexpected error occurred",
    });
  }
};
