import { RequestHandler } from "express";

export const handleCheckIpAssets: RequestHandler = async (req, res) => {
  try {
    const { address } = req.body;

    if (!address || typeof address !== "string") {
      return res.status(400).json({ error: "Address is required" });
    }

    const trimmedAddress = address.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmedAddress)) {
      return res.status(400).json({ error: "Invalid Ethereum address format" });
    }

    const apiKey = process.env.STORY_API_KEY;
    if (!apiKey) {
      console.error("STORY_API_KEY environment variable not configured");
      return res.status(500).json({
        error: "Server configuration error: STORY_API_KEY not set. Please contact the administrator.",
        details: "The STORY_API_KEY environment variable is missing. On Vercel, add it to your project settings under Environment Variables.",
      });
    }

    let allAssets: any[] = [];
    let offset = 0;
    let hasMore = true;
    const limit = 100;

    while (hasMore) {
      try {
        const response = await fetch("https://api.storyapis.com/api/v4/assets", {
          method: "POST",
          headers: {
            "X-Api-Key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            where: {
              ownerAddress: trimmedAddress,
            },
            pagination: {
              limit,
              offset,
            },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(
            `Story API Error: ${response.status} - ${errorText}`,
            { address: trimmedAddress, offset }
          );

          let errorDetail = errorText;
          try {
            const errorJson = JSON.parse(errorText);
            errorDetail = errorJson.message || errorJson.error || errorText;
          } catch {
            // Keep the raw text if not JSON
          }

          return res.status(response.status).json({
            error: `Failed to fetch IP assets from Story API`,
            details: errorDetail,
            status: response.status,
          });
        }

        const data = await response.json();
        const assets = Array.isArray(data) ? data : data?.data || [];

        if (!Array.isArray(assets)) {
          console.warn("Unexpected response format from Story API", {
            address: trimmedAddress,
            offset,
            dataKeys: Object.keys(data),
          });
          allAssets = allAssets.concat([]);
        } else {
          allAssets = allAssets.concat(assets);
        }

        const pagination = data?.pagination;
        hasMore = pagination?.hasMore === true;
        offset += limit;
      } catch (fetchError: any) {
        console.error("Fetch request failed for Story API", {
          address: trimmedAddress,
          offset,
          error: fetchError?.message,
        });
        return res.status(500).json({
          error: "Network error while fetching IP assets",
          details: fetchError?.message || "Unable to connect to Story API",
        });
      }
    }

    const originalCount = allAssets.filter((asset: any) => {
      const parentCount = asset.parentsCount ?? 0;
      return parentCount === 0;
    }).length;

    const remixCount = allAssets.filter((asset: any) => {
      const parentCount = asset.parentsCount ?? 0;
      return parentCount > 0;
    }).length;

    const totalCount = allAssets.length;

    res.json({
      address: trimmedAddress,
      totalCount,
      originalCount,
      remixCount,
    });
  } catch (error: any) {
    console.error("Check IP Assets Error:", error);
    res.status(500).json({
      error: error?.message || "Internal server error",
      details:
        process.env.NODE_ENV !== "production"
          ? error?.stack
          : "An unexpected error occurred",
    });
  }
};
