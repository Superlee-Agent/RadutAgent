import { RequestHandler } from "express";

export const handleDebugOpenAI: RequestHandler = (_req, res) => {
  const hasKey = !!process.env.OPENAI_API_KEY;
  res.json({ ok: true, hasKey });
};
