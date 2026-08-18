const { fork } = require("node:child_process");
const http = require("node:http");
const test = require("node:test");
const assert = require("node:assert/strict");

function request(port, path, { method = "GET", body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? "" : JSON.stringify(body);
    const req = http.request({
      host: "127.0.0.1", port, path, method,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    req.on("error", reject);
    req.end(payload);
  });
}

async function startServer(t) {
  const server = fork("src/server.js", [], { env: { ...process.env, PORT: "0" }, silent: true });
  t.after(() => server.kill());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server did not start")), 5_000);
    server.once("message", (message) => {
      if (message?.type !== "listening") return;
      clearTimeout(timer);
      resolve(message.port);
    });
    server.once("error", reject);
  });
}

test("holdings API supports listing, validation, merge, update, and delete", async (t) => {
  const port = await startServer(t);
  const initial = await request(port, "/api/holdings");
  assert.equal(initial.status, 200);
  assert.equal(initial.body.length, 3);

  const invalid = await request(port, "/api/holdings", { method: "POST", body: { symbol: "bad symbol", quantity: 1 } });
  assert.equal(invalid.status, 400);

  const added = await request(port, "/api/holdings", { method: "POST", body: { symbol: "TSLA", quantity: 2, purchasePrice: 300, currency: "CAD" } });
  assert.equal(added.status, 201);
  assert.deepEqual(added.body, { symbol: "TSLA", quantity: 2, purchasePrice: 300, currency: "CAD" });

  const merged = await request(port, "/api/holdings", { method: "POST", body: { symbol: "TSLA", quantity: 3 } });
  assert.equal(merged.status, 201);
  assert.equal(merged.body.quantity, 5);

  const updated = await request(port, "/api/holdings/TSLA", { method: "PATCH", body: { quantity: 4, purchasePrice: null } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.quantity, 4);
  assert.equal(updated.body.purchasePrice, null);

  const deleted = await request(port, "/api/holdings/TSLA", { method: "DELETE" });
  assert.equal(deleted.status, 204);
  assert.equal((await request(port, "/api/holdings/TSLA", { method: "DELETE" })).status, 404);
});

test("holdings API rejects malformed JSON and unknown API routes", async (t) => {
  const port = await startServer(t);
  const malformed = await new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: "/api/holdings", method: "POST", headers: { "Content-Type": "application/json" } }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", reject);
    req.end("{not json");
  });
  assert.equal(malformed, 502);
  assert.equal((await request(port, "/api/unknown")).status, 404);
});
