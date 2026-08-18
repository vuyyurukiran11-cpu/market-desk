const { fork, spawn } = require("node:child_process");

const port = process.env.PORT || 3000;
const server = fork("src/server.js", [], { env: { ...process.env, AUTO_STOP: "1", PORT: port } });

server.once("message", (message) => {
  if (message?.type !== "listening") return;
  const browser = spawn("cmd.exe", ["/c", "start", "", `http://localhost:${port}`], { detached: true, stdio: "ignore", windowsHide: true });
  browser.unref();
});

server.on("exit", (code) => process.exit(code || 0));
