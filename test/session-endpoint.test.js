const { fork } = require("node:child_process");
const http = require("node:http");
const test = require("node:test");
const assert = require("node:assert/strict");

const request = (port, path, origin) => new Promise((resolve, reject) => {
  const req = http.request({ host: "127.0.0.1", port, path, method: "POST", headers: { Origin: origin } }, (res) => {
    res.resume();
    res.on("end", () => resolve(res.statusCode));
  });
  req.on("error", reject);
  req.end();
});

test("session endpoint accepts only same-origin, valid session IDs", async (t) => {
  const server = fork("server.js", [], { env: { ...process.env, PORT: "0" }, silent: true });
  t.after(() => server.kill());
  const port = await new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      server.off("message", onMessage);
      server.off("error", onError);
      server.off("exit", onExit);
    };
    const onMessage = (message) => {
      if (message?.type === "listening" && Number.isInteger(message.port) && message.port > 0) {
        cleanup();
        resolve(message.port);
      }
    };
    const onError = (error) => { cleanup(); reject(error); };
    const onExit = (code, signal) => { cleanup(); reject(new Error(`Server exited before listening (code ${code}, signal ${signal})`)); };
    server.on("message", onMessage);
    server.once("error", onError);
    server.once("exit", onExit);
    timer = setTimeout(() => { cleanup(); reject(new Error("Server did not report a listening port")); }, 5_000);
  });

  const origin = `http://127.0.0.1:${port}`;
  assert.equal(await request(port, "/api/session?id=browser-tab", origin), 204);
  assert.equal(await request(port, "/api/session?id=browser-tab", "http://example.test"), 403);
  assert.equal(await request(port, "/api/session?id=", origin), 400);
  assert.equal(await request(port, `/api/session?id=${"a".repeat(129)}`, origin), 400);
});
