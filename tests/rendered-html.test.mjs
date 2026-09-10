import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout } from "node:timers/promises";
import test from "node:test";

test("production login, security headers, and API authentication", { timeout: 30_000 }, async () => {
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: { ...process.env, DATABASE_URL: "", NEXT_PUBLIC_APP_URL: origin }, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stdout.on("data", (data) => { output += data; });
  server.stderr.on("data", (data) => { output += data; });
  try {
    let response;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error(`Next.js exited: ${output}`);
      try { response = await fetch(origin); break; } catch { await setTimeout(100); }
    }
    assert.ok(response, `Next.js did not start: ${output}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /ComNet/);
    assert.match(html, /type="password"/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    for (const path of ["records?companyId=1", "reports?companyId=1", "admin-users", "transfers", "inventory-overview", "auth/session"]) {
      const protectedResponse = await fetch(`${origin}/api/${path}`);
      assert.equal(protectedResponse.status, 401, path);
      assert.match(protectedResponse.headers.get("cache-control"), /no-store/);
    }
    const csrf = await fetch(`${origin}/api/auth/session`, { method: "POST", headers: { origin: "https://attacker.test", "content-type": "application/json" }, body: "{}" });
    assert.equal(csrf.status, 403);
    const malformed = await fetch(`${origin}/api/auth/session`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "null" });
    assert.equal(malformed.status, 400);
  } finally {
    const stopped = once(server, "exit");
    server.kill("SIGTERM");
    if (server.exitCode === null) await stopped;
  }
});
