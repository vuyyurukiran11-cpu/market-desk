const { fork } = require("node:child_process");
const http = require("node:http");
const net = require("node:net");
const test = require("node:test");
const assert = require("node:assert/strict");

const freePort = () => new Promise((resolve) => {
  const listener = net.createServer();
  listener.listen(0, "127.0.0.1", () => {
    const { port } = listener.address();
    listener.close(() => resolve(port));
  });
});

const request = (port, path, origin) => new Promise((resolve, reject) => {
  const req = http.request({ host: "127.0.0.1", port, path, method: "POST", headers: { Origin: origin } }, (res) => {
    res.resume();
    res.on("end", () => resolve(res.statusCode));
  });
  req.on("error", reject);
  req.end();
});

test("session endpoint accepts only same-origin, valid session IDs", async (t) => {
  const port = await freePort();
  const server = fork("server.js", [], { env: { ...process.env, PORT: String(port) }, silent: true });
  t.after(() => server.kill());
  await new Promise((resolve) => server.once("message", resolve));

  const origin = `http://127.0.0.1:${port}`;
  assert.equal(await request(port, "/api/session?id=browser-tab", origin), 204);
  assert.equal(await request(port, "/api/session?id=browser-tab", "http://example.test"), 403);
  assert.equal(await request(port, "/api/session?id=", origin), 400);
  assert.equal(await request(port, `/api/session?id=${"a".repeat(129)}`, origin), 400);
});
