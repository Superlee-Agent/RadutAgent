import { createServer } from "../server";

// Export the Express app as a Vercel Serverless Function handler
const app = createServer();
export default function handler(req: any, res: any) {
  return app(req, res);
}
