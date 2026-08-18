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

test("session remains active when a delayed keepalive arrives after 25 seconds", () => {
  const originalNow = Date.now;
  let now = 0;
  Date.now = () => now;
  try {
    const sessions = createSessionTracker();
    sessions.touch("browser-tab");
    now = 26_000;
    assert.equal(sessions.active(), true);
    sessions.touch("browser-tab");
    assert.equal(sessions.active(), true);
  } finally {
    Date.now = originalNow;
  }
});
