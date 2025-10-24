import { RequestHandler } from "express";
import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const handleGetSuggestions: RequestHandler = async (req, res) => {
  try {
    const { input, context } = req.body;

    if (!input || typeof input !== "string") {
      return res.status(400).json({
        ok: false,
        error: "input_required",
        suggestions: [],
      });
    }

    // Build context from previous messages
    const contextStr =
      context
        ?.slice(-3)
        ?.map(
          (msg: any) =>
            `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`,
        )
        .join("\n") || "";

    // Check if "ip" or "asset" is in the input
    const hasIpKeyword = /\b(ip|asset|nft|search|find|cari)\b/i.test(input);

    let suggestionPrompt = "";
    if (!hasIpKeyword) {
      // If no IP keyword, suggest adding it
      suggestionPrompt = `You are a helpful AI assistant for searching IP (Intellectual Property) assets on Story Protocol.

User is typing: "${input}"

The user hasn't mentioned IP/assets yet. Provide 3 suggestions that add "ip" or "search ip" to their message to make it an IP asset search.

Rules:
- Each suggestion should be SHORT (max 10 words)
- ALWAYS include "ip" or "search ip" in the suggestions
- Make them natural and relevant to the input
- Return ONLY a JSON array of 3 strings, nothing else

Example: User types "dragon" → ["search ip dragon", "find ip dragon artwork", "show me ip dragon"]`;
    } else {
      // If IP keyword exists, help complete the query
      suggestionPrompt = `You are a helpful AI assistant for searching IP assets on Story Protocol.

User is typing: "${input}"

Provide 3 helpful suggestions to complete or improve their IP asset search message.
Suggestions could be:
- Completing their search (e.g., "search ip dragon" → "search ip dragon artwork")
- Adding media type filters (e.g., "search dragon" → "search ip dragon video", "search ip dragon image")
- Related searches (e.g., "dragon" → "dragon NFT", "dragon animation")

Rules:
- Each suggestion should be SHORT (max 10 words)
- Try to include media types (image, video, audio) when relevant
- Return ONLY a JSON array of 3 strings, nothing else

Example format:
["search ip dragon image", "find ip dragon video", "search ip dragon artwork"]`;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: suggestionPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    const responseText = response.choices[0]?.message?.content?.trim() || "[]";

    // Parse the JSON response
    let suggestions: string[] = [];
    try {
      const parsed = JSON.parse(responseText);
      suggestions = Array.isArray(parsed)
        ? parsed.filter((s: any) => typeof s === "string").slice(0, 3)
        : [];
    } catch (parseError) {
      // If parsing fails, try to extract suggestions from the response
      console.warn("Failed to parse suggestions response:", responseText);
      suggestions = [];
    }

    return res.json({
      ok: true,
      suggestions: suggestions,
    });
  } catch (error) {
    console.error("Error getting suggestions:", error);
    return res.status(500).json({
      ok: false,
      error: "suggestions_error",
      suggestions: [],
    });
  }
};
