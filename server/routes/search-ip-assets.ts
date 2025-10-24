import { RequestHandler } from "express";

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

      console.log("[Search IP] Response data:", {
        totalResults: data?.total,
        resultsCount: data?.data?.length,
        hasMore: data?.pagination?.hasMore,
      });

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

              if (Array.isArray(metadataData.data)) {
                metadataData.data.forEach((asset: any) => {
                  metadataMap.set(asset.ipId, asset);
                });
              }

              enrichedResults = searchResults.map((result: any) => {
                const metadata = metadataMap.get(result.ipId);

                // Priority order for image URL
                let imageUrl = null;
                if (metadata?.image?.cachedUrl) {
                  imageUrl = metadata.image.cachedUrl;
                } else if (metadata?.image?.pngUrl) {
                  imageUrl = metadata.image.pngUrl;
                } else if (metadata?.image?.thumbnailUrl) {
                  imageUrl = metadata.image.thumbnailUrl;
                } else if (metadata?.image?.originalUrl) {
                  imageUrl = metadata.image.originalUrl;
                } else if (metadata?.nftMetadata?.animation?.cachedUrl) {
                  imageUrl = metadata.nftMetadata.animation.cachedUrl;
                } else if (
                  metadata?.nftMetadata?.contract?.openSeaMetadata?.imageUrl
                ) {
                  imageUrl =
                    metadata.nftMetadata.contract.openSeaMetadata.imageUrl;
                }

                return {
                  ...result,
                  imageUrl,
                  ipaMetadataUri: metadata?.ipaMetadataUri,
                  ownerAddress: metadata?.ownerAddress,
                  lastUpdatedAt: metadata?.lastUpdatedAt,
                };
              });

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
