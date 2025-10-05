import serverless from "serverless-http";
import { createServer } from "../server/index.js";

const app = createServer();
const handler = serverless(app, {
  binary: ["image/*", "multipart/form-data", "application/octet-stream"],
});

export default async function (req: any, res: any) {
  return handler(req, res);
}
