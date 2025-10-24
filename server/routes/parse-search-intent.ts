import { RequestHandler } from "express";
import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const handleParseSearchIntent: RequestHandler = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        ok: false,
        error: "message_required",
        message: "Message is required",
      });
    }

    const messageLower = message.toLowerCase().trim();

    // Check for owner address pattern: "search/find asset(s) by 0x..."
    const ownerAddressMatch = message.match(
      /(?:search|find|cari|mencari)\s+(?:for\s+)?(?:assets?|aset)\s+by\s+(0x[a-fA-F0-9]{40})/i,
    );

    if (ownerAddressMatch && ownerAddressMatch[1]) {
      return res.json({
        ok: true,
        isSearchIntent: true,
        searchType: "owner",
        ownerAddress: ownerAddressMatch[1],
        mediaType: null,
      });
    }

    // Check for .ip name pattern: "search/find asset(s) by myname.ip" or just "myname.ip"
    const ipNameMatch = message.match(
      /([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.ip)/i,
    );

    if (ipNameMatch && ipNameMatch[1]) {
      const ipName = ipNameMatch[1];
      return res.json({
        ok: true,
        isSearchIntent: true,
        searchType: "ip-name",
        searchQuery: ipName,
        mediaType: null,
      });
    }

    // Quick regex checks for common patterns
    const hasSearchKeyword = /\b(search|find|cari|mencari|lookup)\b/.test(
      messageLower,
    );
    const hasIpKeyword = /\b(ip|asset|aset|nft)\b/.test(messageLower);

    if (!hasSearchKeyword || !hasIpKeyword) {
      return res.json({
        ok: true,
        isSearchIntent: false,
        message: "Not a search intent",
      });
    }

    // Use LLM to parse the intent
    const parsePrompt = `
You are an expert at parsing user search intents for IP (Intellectual Property) assets.

User message: "${message}"

Determine if this is a search request for IP assets and extract the search query.

Respond with ONLY a valid JSON object in this format (no other text):
{
  "isSearchIntent": boolean,
  "searchQuery": "the extracted search query or empty string if not a search",
  "mediaType": "optional media type filter: 'image', 'video', 'audio', or null"
}

Examples:
- "search for dragon images" → {"isSearchIntent": true, "searchQuery": "dragon", "mediaType": "image"}
- "find me mushy ip image" → {"isSearchIntent": true, "searchQuery": "mushy", "mediaType": "image"}
- "search ip dragon" → {"isSearchIntent": true, "searchQuery": "dragon", "mediaType": null}
- "cari image art" → {"isSearchIntent": true, "searchQuery": "art", "mediaType": "image"}
- "hello there" → {"isSearchIntent": false, "searchQuery": "", "mediaType": null}
- "show me video NFT" → {"isSearchIntent": true, "searchQuery": "NFT", "mediaType": "video"}

Be flexible and smart about extracting the actual search term from rambling or natural language input.
`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_VERIFIER_MODEL || "gpt-4o",
      messages: [
        {
          role: "user",
          content: parsePrompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 200,
    });

    let parsedIntent = {
      isSearchIntent: false,
      searchQuery: "",
      mediaType: null as string | null,
    };

    try {
      const responseText = completion.choices[0]?.message?.content || "{}";
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        parsedIntent = {
          isSearchIntent: !!parsed.isSearchIntent,
          searchQuery: parsed.searchQuery || "",
          mediaType: parsed.mediaType || null,
        };
      }
    } catch (parseError) {
      console.error("Failed to parse LLM response", parseError);
    }

    res.json({
      ok: true,
      ...parsedIntent,
      searchType: "query",
    });
  } catch (error: any) {
    console.error("Parse Search Intent Error:", error);
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
