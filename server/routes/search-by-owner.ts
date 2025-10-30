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

  const PUBLIC_GATEWAY = "dweb.link";

  if (uri.startsWith("ipfs://")) {
    const cid = uri.replace("ipfs://", "");
    return `https://${PUBLIC_GATEWAY}/ipfs/${cid}`;
  }

  if (uri.includes("ipfs.io/ipfs/")) {
    const cid = uri.split("/ipfs/")[1];
    return `https://${PUBLIC_GATEWAY}/ipfs/${cid}`;
  }

  if (uri.includes("mypinata.cloud")) {
    return uri;
  }

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

    if (url.startsWith("ipfs://")) {
      const cid = url.replace("ipfs://", "");
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

export const handleSearchByOwner: RequestHandler = async (req, res) => {
  try {
    const { ownerAddress } = req.body;

    if (!ownerAddress || typeof ownerAddress !== "string") {
      return res.status(400).json({
        ok: false,
        error: "owner_address_required",
        message: "Owner address is required",
      });
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(ownerAddress)) {
      return res.status(400).json({
        ok: false,
        error: "invalid_address",
        message: "Invalid Ethereum address format",
      });
    }

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
      console.log(
        "[Search By Owner] Searching for assets by owner:",
        ownerAddress,
      );

      let allAssets: any[] = [];
      let offset = 0;
      let hasMore = true;
      const limit = 100;
      const maxIterations = 10;
      let iterations = 0;

      while (hasMore && iterations < maxIterations) {
        iterations += 1;

        try {
          const response = await fetch(
            "https://api.storyapis.com/api/v4/assets",
            {
              method: "POST",
              headers: {
                "X-Api-Key": apiKey,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                includeLicenses: true,
                moderated: false,
                orderBy: "blockNumber",
                orderDirection: "desc",
                pagination: {
                  limit,
                  offset,
                },
                where: {
                  ownerAddress: ownerAddress,
                },
              }),
              signal: controller.signal,
            },
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error(
              `Story API Error: ${response.status} - ${errorText}`,
              {
                ownerAddress,
                offset,
                iteration: iterations,
              },
            );

            let errorDetail = errorText;
            try {
              const errorJson = JSON.parse(errorText);
              errorDetail = errorJson.message || errorJson.error || errorText;
            } catch {
              // Keep the raw text if not JSON
            }

            clearTimeout(timeoutId);
            return res.status(response.status).json({
              ok: false,
              error: "story_api_error",
              details: errorDetail,
              status: response.status,
            });
          }

          const data = await response.json();

          console.log("[Search By Owner] Raw API response:", {
            ownerAddress,
            offset,
            iteration: iterations,
            status: response.status,
            dataType: typeof data,
            dataKeys: Object.keys(data || {}),
            dataArray: Array.isArray(data)
              ? `Array of ${data.length}`
              : Array.isArray(data?.data)
                ? `data array of ${data.data.length}`
                : "not array",
            paginationInfo: data?.pagination,
          });

          if (!data) {
            console.error("Empty response from Story API", {
              ownerAddress,
              offset,
              iteration: iterations,
            });
            break;
          }

          const assets = Array.isArray(data) ? data : data?.data || [];

          if (!Array.isArray(assets)) {
            console.warn("Unexpected response format from Story API", {
              ownerAddress,
              offset,
              iteration: iterations,
              dataKeys: Object.keys(data || {}),
              dataType: typeof data,
            });
            break;
          }

          const validAssets = assets.filter((asset: any) => {
            if (!asset || typeof asset !== "object") {
              console.warn("Invalid asset object", { asset });
              return false;
            }
            return true;
          });

          allAssets = allAssets.concat(validAssets);

          const pagination = data?.pagination;
          hasMore = pagination?.hasMore === true && validAssets.length > 0;
          offset += limit;

          if (
            pagination?.hasMore === false ||
            !pagination ||
            validAssets.length === 0
          ) {
            hasMore = false;
          }
        } catch (fetchError: any) {
          if (fetchError.name === "AbortError") {
            console.error("Request timeout while fetching IP assets by owner", {
              ownerAddress,
              offset,
              iteration: iterations,
            });
            clearTimeout(timeoutId);
            return res.status(504).json({
              ok: false,
              error: "timeout",
              details: "The Story API is responding slowly. Please try again.",
            });
          }

          console.error("Fetch request failed for Story API", {
            ownerAddress,
            offset,
            iteration: iterations,
            error: fetchError?.message,
          });
          clearTimeout(timeoutId);
          return res.status(500).json({
            ok: false,
            error: "network_error",
            details: fetchError?.message || "Unable to connect to Story API",
          });
        }
      }

      clearTimeout(timeoutId);

      if (iterations >= maxIterations) {
        console.warn(
          "Max iterations reached when fetching IP assets by owner",
          {
            ownerAddress,
            assetsCollected: allAssets.length,
          },
        );
      }

      console.log("[Search By Owner] Response data:", {
        totalResults: allAssets.length,
        iterations,
      });

      if (allAssets.length > 0) {
        console.log(
          "[Search By Owner] First asset sample:",
          JSON.stringify(allAssets[0], null, 2).substring(0, 1500),
        );
      }

      const searchResults = allAssets;

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
          // Try HEAD first
          const headResponse = await fetch(url, {
            method: "HEAD",
            signal: AbortSignal.timeout(5000),
          }).catch(() => null);

          if (headResponse) {
            const contentType = headResponse.headers.get("content-type") || "";
            if (contentType.startsWith("video/")) return true;
          }

          // Fallback: Try GET with range header (just get first byte)
          const getResponse = await fetch(url, {
            headers: { Range: "bytes=0-0" },
            signal: AbortSignal.timeout(5000),
          });

          const contentType = getResponse.headers.get("content-type") || "";
          return contentType.startsWith("video/");
        } catch {
          return false;
        }
      };

      // Enrich results with metadata
      let enrichedResults = await Promise.all(
        searchResults.map(async (result: any) => {
          // Determine if asset is derivative by checking parentsCount
          const parentsCount = result?.parentsCount || 0;
          const isDerivative = parentsCount > 0;

          // Fetch parent IP details for derivative assets
          let parentIpDetails = null;
          if (isDerivative) {
            parentIpDetails = await fetchParentIpDetails(result.ipId, apiKey);
            if (parentIpDetails) {
              console.log(
                `[Search By Owner] Fetched parent details for ${result.ipId}:`,
                parentIpDetails,
              );
            }
          }

          let mediaType = result?.mediaType || "image";
          let mediaUrl = null;
          let thumbnailUrl = null;

          if (mediaType === "image" || mediaType === "animation") {
            if (result?.image?.cachedUrl) {
              mediaUrl = result.image.cachedUrl;
            } else if (result?.image?.pngUrl) {
              mediaUrl = result.image.pngUrl;
            } else if (result?.image?.thumbnailUrl) {
              mediaUrl = result.image.thumbnailUrl;
            } else if (result?.image?.originalUrl) {
              mediaUrl = result.image.originalUrl;
            }

            if (!mediaUrl) {
              if (result?.nftMetadata?.image?.cachedUrl) {
                mediaUrl = result.nftMetadata.image.cachedUrl;
              } else if (result?.nftMetadata?.image?.pngUrl) {
                mediaUrl = result.nftMetadata.image.pngUrl;
              } else if (
                result?.nftMetadata?.contract?.openSeaMetadata?.imageUrl
              ) {
                mediaUrl = result.nftMetadata.contract.openSeaMetadata.imageUrl;
              }
            }
          } else if (mediaType === "video") {
            if (result?.nftMetadata?.animation?.cachedUrl) {
              mediaUrl = result.nftMetadata.animation.cachedUrl;
            } else if (result?.nftMetadata?.animation?.originalUrl) {
              mediaUrl = result.nftMetadata.animation.originalUrl;
            } else if (result?.image?.cachedUrl) {
              mediaUrl = result.image.cachedUrl;
            }
            if (result?.image?.cachedUrl) {
              thumbnailUrl = result.image.cachedUrl;
            } else if (result?.image?.thumbnailUrl) {
              thumbnailUrl = result.image.thumbnailUrl;
            }
          } else if (mediaType === "audio") {
            if (result?.nftMetadata?.animation?.cachedUrl) {
              mediaUrl = result.nftMetadata.animation.cachedUrl;
            } else if (result?.nftMetadata?.animation?.originalUrl) {
              mediaUrl = result.nftMetadata.animation.originalUrl;
            }
            if (result?.image?.cachedUrl) {
              thumbnailUrl = result.image.cachedUrl;
            } else if (result?.image?.thumbnailUrl) {
              thumbnailUrl = result.image.thumbnailUrl;
            }
          }

          if (!mediaUrl && result?.nftMetadata?.raw?.image) {
            mediaUrl = result.nftMetadata.raw.image;
          }

          if (!mediaUrl && result?.ipaMetadataUri) {
            const ipaMetadata = await fetchIpaMetadata(result.ipaMetadataUri);
            if (ipaMetadata) {
              if (mediaType === "video") {
                if (ipaMetadata.animation) {
                  mediaUrl = convertIpfsUriToHttp(ipaMetadata.animation);
                } else if (ipaMetadata.animationUrl) {
                  mediaUrl = convertIpfsUriToHttp(ipaMetadata.animationUrl);
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
                if (ipaMetadata.audio) {
                  mediaUrl = convertIpfsUriToHttp(ipaMetadata.audio);
                } else if (ipaMetadata.audioUrl) {
                  mediaUrl = convertIpfsUriToHttp(ipaMetadata.audioUrl);
                } else if (ipaMetadata.animation) {
                  mediaUrl = convertIpfsUriToHttp(ipaMetadata.animation);
                } else if (ipaMetadata.animationUrl) {
                  mediaUrl = convertIpfsUriToHttp(ipaMetadata.animationUrl);
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
                if (ipaMetadata.mediaUrl) {
                  mediaUrl = convertIpfsUriToHttp(ipaMetadata.mediaUrl);
                } else if (ipaMetadata.image) {
                  mediaUrl = convertIpfsUriToHttp(ipaMetadata.image);
                } else if (ipaMetadata.animationUrl) {
                  mediaUrl = convertIpfsUriToHttp(ipaMetadata.animationUrl);
                } else if (
                  ipaMetadata.media &&
                  Array.isArray(ipaMetadata.media) &&
                  ipaMetadata.media.length > 0
                ) {
                  mediaUrl = convertIpfsUriToHttp(ipaMetadata.media[0]);
                }
              }

              if (!thumbnailUrl) {
                if (ipaMetadata.thumbnailUrl) {
                  thumbnailUrl = convertIpfsUriToHttp(ipaMetadata.thumbnailUrl);
                } else if (ipaMetadata.image) {
                  thumbnailUrl = convertIpfsUriToHttp(ipaMetadata.image);
                } else if (ipaMetadata.thumbnail) {
                  thumbnailUrl = convertIpfsUriToHttp(ipaMetadata.thumbnail);
                }
              }

              console.log(
                `[Search By Owner] Extracted from IPA metadata for ${result.ipId}:`,
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
                `[Search By Owner] Auto-detected video for ${result.ipId} from URL extension: ${mediaUrl}`,
              );
            } else {
              // Check Content-Type header as additional fallback
              const isVideo = await checkContentType(mediaUrl);
              if (isVideo) {
                mediaType = "video/mp4";
                console.log(
                  `[Search By Owner] Auto-detected video for ${result.ipId} from Content-Type: ${mediaUrl}`,
                );
              }
            }
          }

          return {
            ...result,
            mediaUrl: mediaUrl || null,
            mediaType: mediaType,
            thumbnailUrl: thumbnailUrl,
            ipaMetadataUri: result?.ipaMetadataUri,
            ownerAddress: result?.ownerAddress,
            lastUpdatedAt: result?.lastUpdatedAt,
            isDerivative: isDerivative,
            parentsCount: parentsCount,
            parentIpDetails: parentIpDetails || undefined,
            licenses: result?.licenses || [],
          };
        }),
      );

      console.log(
        `[Search By Owner] Enriched ${enrichedResults.length} results with metadata`,
      );

      res.json({
        ok: true,
        results: enrichedResults,
        totalSearched: enrichedResults.length,
        message: `Found ${enrichedResults.length} IP assets owned by ${ownerAddress}`,
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);

      if (fetchError.name === "AbortError") {
        console.error("Request timeout while searching IP assets by owner", {
          ownerAddress,
        });
        return res.status(504).json({
          ok: false,
          error: "timeout",
          details: "The Story API is responding slowly. Please try again.",
        });
      }

      console.error("Fetch request failed for Story API", {
        ownerAddress,
        error: fetchError?.message,
      });
      return res.status(500).json({
        ok: false,
        error: "network_error",
        details: fetchError?.message || "Unable to connect to Story API",
      });
    }
  } catch (error: any) {
    console.error("Search By Owner Error:", error);
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
