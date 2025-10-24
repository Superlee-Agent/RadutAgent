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

    const suggestionPrompt = `You are a helpful AI assistant for searching and exploring IP (Intellectual Property) assets on Story Protocol.

Current conversation context:
${contextStr}

User is typing: "${input}"

Based on the context and what the user is typing, provide 3 helpful suggestions to complete or improve their message. 
Suggestions could be:
- Completing their search query (e.g., "search ip mushroom" → "search ip mushroom artwork")
- Asking clarifying questions (e.g., "looking for" → "looking for video content")
- Related searches (e.g., "dragon" → "dragon artwork", "dragon animation", "dragon NFT")
- Helpful tips (e.g., "can you" → "can you show me trending IPs?")

Rules:
- Each suggestion should be SHORT (max 8 words)
- Suggestions should be natural and helpful
- They should relate to IP assets, media types (image, video, audio), or Story Protocol
- Return ONLY a JSON array of 3 strings, nothing else

Example format:
["search ip dragon artwork", "show me video NFTs", "find trending IP assets"]`;

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
      timeout: 5000,
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
