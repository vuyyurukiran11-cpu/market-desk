const { fork } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

function request(port, path, { method = "GET", body, origin = `http://127.0.0.1:${port}` } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? "" : JSON.stringify(body);
    const req = http.request({
      host: "127.0.0.1", port, path, method,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), ...(origin ? { Origin: origin } : {}) }
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
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "market-holdings-"));
  const holdingsFile = path.join(dataDir, "holdings.json");
  const server = fork("src/server.js", [], { env: { ...process.env, HOLDINGS_FILE: holdingsFile, PORT: "0" }, silent: true });
  t.after(() => server.kill());
  t.after(() => fs.rmSync(dataDir, { force: true, recursive: true }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server did not start")), 5_000);
    server.once("message", (message) => {
      if (message?.type !== "listening") return;
      clearTimeout(timer);
      resolve({ holdingsFile, port: message.port });
    });
    server.once("error", reject);
  });
}

test("holdings API supports listing, validation, merge, update, and delete", async (t) => {
  const { holdingsFile, port } = await startServer(t);
  const initial = await request(port, "/api/holdings");
  assert.equal(initial.status, 200);
  assert.equal(initial.body.length, 3);
  assert.equal((await request(port, "/api/holdings", { origin: null })).status, 200);
  assert.equal((await request(port, "/api/holdings", { origin: "http://example.test" })).status, 403);

  const invalid = await request(port, "/api/holdings", { method: "POST", body: { symbol: "bad symbol", quantity: 1 } });
  assert.equal(invalid.status, 400);

  const invalidCurrency = await request(port, "/api/holdings", { method: "POST", body: { symbol: "TSLA", quantity: 1, currency: "EUR" } });
  assert.equal(invalidCurrency.status, 400);

  const added = await request(port, "/api/holdings", { method: "POST", body: { symbol: "TSLA", quantity: 2, purchasePrice: 300, currency: "CAD" } });
  assert.equal(added.status, 201);
  assert.deepEqual(added.body, { symbol: "TSLA", quantity: 2, purchasePrice: 300, currency: "CAD" });
  assert.deepEqual(JSON.parse(fs.readFileSync(holdingsFile, "utf8")).at(-1), added.body);

  const merged = await request(port, "/api/holdings", { method: "POST", body: { symbol: "TSLA", quantity: 3 } });
  assert.equal(merged.status, 200);
  assert.equal(merged.body.quantity, 5);

  const updated = await request(port, "/api/holdings/TSLA", { method: "PATCH", body: { quantity: 4, purchasePrice: null } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.quantity, 4);
  assert.equal(updated.body.purchasePrice, null);
  const persistedUpdate = JSON.parse(fs.readFileSync(holdingsFile, "utf8")).find(({ symbol }) => symbol === "TSLA");
  assert.deepEqual(persistedUpdate, { symbol: "TSLA", quantity: 4, purchasePrice: null, currency: "CAD" });

  assert.equal((await request(port, "/api/holdings/%E0%A4%A", { method: "PATCH", body: { quantity: 1 } })).status, 400);
  assert.equal((await request(port, "/api/holdings/%E0%A4%A", { method: "DELETE" })).status, 400);

  const deleted = await request(port, "/api/holdings/TSLA", { method: "DELETE" });
  assert.equal(deleted.status, 204);
  assert.equal(JSON.parse(fs.readFileSync(holdingsFile, "utf8")).some(({ symbol }) => symbol === "TSLA"), false);
  assert.equal((await request(port, "/api/holdings/TSLA", { method: "DELETE" })).status, 404);
});

test("holdings API rejects malformed JSON and unknown API routes", async (t) => {
  const { port } = await startServer(t);
  const malformed = await new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: "/api/holdings", method: "POST", headers: { "Content-Type": "application/json", "Origin": `http://127.0.0.1:${port}` } }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", reject);
    req.end("{not json");
  });
  assert.equal(malformed, 400);
  assert.equal((await request(port, "/api/unknown")).status, 404);
});

test("server rejects invalid persisted holding records", async (t) => {
  const dataDir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "market-invalid-holdings-"));
  const holdingsFile = path.join(dataDir, "holdings.json");
  fs.writeFileSync(holdingsFile, JSON.stringify([{ symbol: "TSLA", quantity: "2", purchasePrice: 300, currency: "USD" }]));
  const server = fork("src/server.js", [], { env: { ...process.env, HOLDINGS_FILE: holdingsFile, PORT: "0" }, silent: true });
  t.after(() => { server.kill(); fs.rmSync(dataDir, { force: true, recursive: true }); });
  const result = await Promise.race([
    new Promise((resolve) => server.once("exit", (code) => resolve(code))),
    new Promise((resolve) => setTimeout(() => resolve("timeout"), 3_000))
  ]);
  assert.equal(result, 1);
});
