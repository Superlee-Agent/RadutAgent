import serverless from 'serverless-http';

// Dynamically import the built server bundle that is created by `npm run build`.
// Vercel runs the build step and produces `dist/server/node-build.mjs` which exports createServer().
const mod = await import('../dist/server/node-build.mjs');
const createServer = mod.createServer || mod.default?.createServer;
if (!createServer) {
  console.error('createServer not found in dist/server/node-build.mjs');
  throw new Error('Server build not found. Did the build step run?');
}

const app = createServer();

export const handler = serverless(app);
export default handler;
