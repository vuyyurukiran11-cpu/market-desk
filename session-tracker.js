function createSessionTracker(timeoutMs = 60_000) {
  const sessions = new Map();
  let seen = false;
  return {
    touch(id) { if (id) { seen = true; sessions.set(id, Date.now()); } },
    remove(id) { sessions.delete(id); },
    seen() { return seen; },
    active() {
      const cutoff = Date.now() - timeoutMs;
      for (const [id, seenAt] of sessions) if (seenAt < cutoff) sessions.delete(id);
      return sessions.size > 0;
    }
  };
}

module.exports = { createSessionTracker };
