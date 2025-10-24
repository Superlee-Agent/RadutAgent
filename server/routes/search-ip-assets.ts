import { RequestHandler } from "express";
import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const handleSearchIpAssets: RequestHandler = async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({
        ok: false,
        error: "query_required",
        message: "Search query is required",
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

    let allAssets: any[] = [];
    let offset = 0;
    let hasMore = true;
    const limit = 100;
    const maxIterations = 10;
    let iterations = 0;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
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
                pagination: {
                  limit,
                  offset,
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
                query,
                offset,
                iteration: iterations,
              },
            );

            clearTimeout(timeoutId);
            return res.status(response.status).json({
              ok: false,
              error: `story_api_error`,
              details: errorText,
              status: response.status,
            });
          }

          const data = await response.json();

          if (!data) {
            break;
          }

          const assets = Array.isArray(data) ? data : data?.data || [];

          if (!Array.isArray(assets)) {
            console.warn("Unexpected response format from Story API", {
              query,
              offset,
              iteration: iterations,
            });
            break;
          }

          const validAssets = assets.filter((asset: any) => {
            if (!asset || typeof asset !== "object") {
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
            console.error("Request timeout while fetching IP assets", {
              query,
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
            query,
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

      if (allAssets.length === 0) {
        return res.json({
          ok: true,
          results: [],
          message: "No IP assets found",
        });
      }

      const matchingPrompt = `
You are an IP asset matcher. Given a search query and a list of IP assets (with title and description), return the top matching assets.

Search Query: "${query}"

Be flexible with matching - include partial matches, related concepts, similar themes, and variations.

IP Assets:
${allAssets
  .slice(0, 100)
  .map(
    (asset: any, idx: number) => `
${idx + 1}. ID: ${asset.ipId}
   Title: ${asset.title || "N/A"}
   Description: ${asset.description || "N/A"}
   Owner: ${asset.ownerAddress || "N/A"}
   Type: ${asset.isDerivative ? "Derivative" : "Original"}
   Created: ${asset.createdAt || "N/A"}
`,
  )
  .join("\n")}

Return a JSON array with top 10 matching assets (or fewer if not enough matches). Be inclusive and match broadly. Return ONLY valid JSON in this format:
[
  {
    "ipId": "0x...",
    "matchReason": "brief explanation why it matches"
  },
  ...
]

If absolutely no reasonable matches found, return empty array [].
`;

      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_VERIFIER_MODEL || "gpt-4o",
        messages: [
          {
            role: "user",
            content: matchingPrompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      });

      let matchedIds: any[] = [];
      try {
        const responseText = completion.choices[0]?.message?.content || "[]";
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          matchedIds = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.error("Failed to parse LLM response", parseError);
      }

      const matchedAssets = matchedIds
        .map((match: any) => {
          const asset = allAssets.find(
            (a: any) => a.ipId?.toLowerCase() === match.ipId?.toLowerCase(),
          );
          return asset ? { ...asset, matchReason: match.matchReason } : null;
        })
        .filter(Boolean);

      res.json({
        ok: true,
        results: matchedAssets,
        totalSearched: allAssets.length,
        message: `Found ${matchedAssets.length} matching IP assets from ${allAssets.length} total assets`,
      });
    } catch (innerError: any) {
      clearTimeout(timeoutId);
      throw innerError;
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
