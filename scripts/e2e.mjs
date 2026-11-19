/* Runs the whole end-to-end suite against a fresh production build and an in-memory database.
   Usage: npm run e2e [-- playwright args]. Needs nothing running beforehand. */
import { spawn } from "node:child_process";
import { MongoMemoryServer } from "mongodb-memory-server";

const PORT = 3200;
const mongo = await MongoMemoryServer.create({ instance: { port: 27019 } });
const env = {
  ...process.env,
  MONGODB_URI: mongo.getUri("workdesk-e2e"),
  AUTH_SECRET: "e2e-only-secret-not-used-anywhere-else-0123456789",
  AUTH_TRUST_HOST: "true",
  NEXT_DIST_DIR: ".next-e2e",
  NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`,
  E2E_BASE_URL: `http://localhost:${PORT}`,
};

const run = (cmd, args) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { env, stdio: "inherit", shell: false });
    child.on("exit", (code) => resolve(code ?? 1));
  });

let server;
let code = 1;
try {
  if ((await run("npx", ["next", "build"])) !== 0) throw new Error("build failed");
  // Its own process group, so the whole tree (npx and next) can be stopped at the end.
  server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    env,
    stdio: "ignore",
    detached: true,
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/login`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  code = await run("npx", ["playwright", "test", ...process.argv.slice(2)]);
} catch (e) {
  console.error(e);
} finally {
  if (server?.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
  }
  await mongo.stop();
}
process.exit(code);
