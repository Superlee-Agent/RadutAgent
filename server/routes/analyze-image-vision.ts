import type { Request, Response } from "express";

/**
 * Server endpoint to analyze images with OpenAI Vision
 * POST /api/analyze-image-vision
 * Body: { imageBase64: string }
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function handleAnalyzeImageVision(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (!OPENAI_API_KEY) {
      res.status(500).json({
        error: "OpenAI API key not configured",
      });
      return;
    }

    const { imageBase64 } = req.body;

    if (!imageBase64 || typeof imageBase64 !== "string") {
      res.status(400).json({
        error: "imageBase64 is required",
      });
      return;
    }

    // Call OpenAI Vision API
    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${imageBase64}`,
                  },
                },
                {
                  type: "text",
                  text: "Describe this image in detail. Focus on: main subjects, objects, characters, colors, style, distinctive features. Be concise but specific. Output only the description without any preamble or metadata.",
                },
              ],
            },
          ],
          max_tokens: 500,
        }),
      },
    );

    if (!openaiResponse.ok) {
      const error = await openaiResponse.text();
      console.error("OpenAI API error:", error);
      res.status(500).json({
        error: "Failed to analyze image with Vision API",
        details: error,
      });
      return;
    }

    const data = (await openaiResponse.json()) as any;
    const description = data.choices?.[0]?.message?.content;

    if (!description) {
      res.status(500).json({
        error: "No description received from Vision API",
      });
      return;
    }

    res.status(200).json({
      success: true,
      description,
    });
  } catch (error) {
    console.error("Error analyzing image with Vision:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
