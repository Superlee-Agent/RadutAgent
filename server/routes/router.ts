import { RequestHandler } from "express";
import { deterministicRouter, InputStruct, RECOMMENDATIONS } from "../../shared/router";

export const handleDeterministicRoute: RequestHandler = async (req, res) => {
  try {
    const data = req.body as InputStruct;
    const code = deterministicRouter(data);
    const recommendation = RECOMMENDATIONS[code] ?? RECOMMENDATIONS["Jawaban 1"];
    // include source to indicate AI/Human detection and also the original confidences
    const { source, conf_source, conf_animation, conf_face, conf_brand } = data;
    res.status(200).json({
      result: recommendation,
      code,
      source,
      confidences: {
        conf_source,
        conf_animation,
        conf_face,
        conf_brand,
      },
    });
  } catch (err) {
    res.status(400).json({ error: "Invalid payload" });
  }
};
