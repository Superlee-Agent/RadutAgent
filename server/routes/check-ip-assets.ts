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
      console.error("[IP Check] Story API key not configured");
      return res.status(500).json({ error: "Story API key not configured" });
    }

    console.log("[IP Check] Starting asset fetch for address:", trimmedAddress);

    let allAssets: any[] = [];
    let offset = 0;
    let hasMore = true;
    const limit = 100;
    let requestCount = 0;

    while (hasMore) {
      requestCount++;
      console.log(`[IP Check] API request #${requestCount}, offset: ${offset}`);

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
        let errorMessage = `Failed to fetch IP assets: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData?.message) {
            errorMessage = errorData.message;
          } else if (errorData?.error) {
            errorMessage = errorData.error;
          }
          console.error(`[IP Check] Story API Error: ${response.status}`, errorData);
        } catch (e) {
          // Body might not be JSON or already consumed, just log the status
          console.error(`[IP Check] Story API Error: ${response.status} - Could not parse response body`);
        }
        return res.status(response.status).json({ error: errorMessage });
      }

      let data: any;
      try {
        data = await response.json();
        console.log(`[IP Check] API request #${requestCount} succeeded, received ${Array.isArray(data) ? data.length : (data?.data?.length || 0)} assets`);
      } catch (parseError) {
        console.error(`[IP Check] Failed to parse Story API response:`, parseError);
        return res.status(500).json({ error: "Failed to parse API response" });
      }

      // Handle different response formats from the Story API
      let assets: any[] = [];
      let pagination: any = null;

      console.log(`[IP Check] Response structure keys:`, Object.keys(data || {}).slice(0, 10));

      if (Array.isArray(data)) {
        assets = data;
        hasMore = false;
        console.log(`[IP Check] Response is direct array with ${assets.length} items`);
      } else if (data?.data && Array.isArray(data.data)) {
        assets = data.data;
        pagination = data?.pagination;
        console.log(`[IP Check] Response has .data array with ${assets.length} items, pagination:`, pagination);
      } else if (data?.pagination) {
        // Some responses might have pagination but assets elsewhere
        assets = Array.isArray(data?.assets) ? data.assets : [];
        pagination = data.pagination;
        console.log(`[IP Check] Response has .assets array with ${assets.length} items, pagination:`, pagination);
      } else {
        // Fallback: no assets found
        assets = [];
        hasMore = false;
        console.log(`[IP Check] No recognized asset structure in response, treating as empty`);
      }

      // Validate assets are in correct format
      if (!Array.isArray(assets)) {
        console.warn(`[IP Check] Assets is not an array:`, typeof assets);
        assets = [];
      }

      allAssets = allAssets.concat(assets);
      console.log(`[IP Check] Total assets collected so far: ${allAssets.length}`);

      if (pagination) {
        hasMore = pagination.hasMore === true;
        console.log(`[IP Check] Pagination hasMore: ${hasMore}, offset will be: ${offset + limit}`);
      } else {
        // If no pagination info, assume no more pages
        hasMore = false;
        console.log(`[IP Check] No pagination info, stopping pagination loop`);
      }
      offset += limit;
    }

    // Filter assets by whether they have parent assets (remixes) or not (originals)
    // parentsCount indicates number of parent IPs this asset is derived from
    const originalCount = allAssets.filter((asset: any) => {
      // Original assets have no parents (parentsCount is 0 or undefined)
      const parentCount = typeof asset.parentsCount === "number" ? asset.parentsCount : 0;
      return parentCount === 0;
    }).length;

    const remixCount = allAssets.filter((asset: any) => {
      // Remix assets have at least one parent IP
      const parentCount = typeof asset.parentsCount === "number" ? asset.parentsCount : 0;
      return parentCount > 0;
    }).length;

    const totalCount = allAssets.length;

    // Log results for debugging
    console.log(`IP Check - Address: ${trimmedAddress}, Total: ${totalCount}, Original: ${originalCount}, Remix: ${remixCount}`);

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
    });
  }
};
