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
      return res.status(500).json({ error: "Story API key not configured" });
    }

    let allAssets: any[] = [];
    let offset = 0;
    let hasMore = true;
    const limit = 100;

    while (hasMore) {
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
        console.error(`Story API Error: ${response.status} - ${errorText}`);
        return res.status(response.status).json({
          error: `Failed to fetch IP assets: ${response.status}`,
        });
      }

      const data = await response.json();
      const assets = Array.isArray(data) ? data : data?.data || [];
      allAssets = allAssets.concat(assets);

      const pagination = data?.pagination;
      hasMore = pagination?.hasMore === true;
      offset += limit;
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
    });
  }
};
