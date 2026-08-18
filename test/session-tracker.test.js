const test = require("node:test");
const assert = require("node:assert/strict");
const { createSessionTracker } = require("../session-tracker");

test("session tracker records and removes browser sessions", () => {
  const sessions = createSessionTracker();
  assert.equal(sessions.seen(), false);
  sessions.touch("browser-tab");
  assert.equal(sessions.seen(), true);
  assert.equal(sessions.active(), true);
  sessions.remove("browser-tab");
  assert.equal(sessions.active(), false);
});
