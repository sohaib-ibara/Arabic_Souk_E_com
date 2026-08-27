/**
 * Runs the noon access probe once, then serves the result over HTTP.
 *
 * Railway restarts a container that exits, so a one-shot script would loop.
 * Holding the port open keeps it to a single run, and makes the answer a URL
 * anyone can open — which is easier to forward to a team lead than a log.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";

const PORT = process.env.PORT || 3000;
// Beside this file in the image; elsewhere when running it locally to check the
// harness itself works before anyone deploys it.
const PROBE = process.env.PROBE_SCRIPT || "noon-access-test.mjs";

let output = "Probe still running — refresh in a moment.\n";
let done = false;

function run(label, env) {
  return new Promise((resolve) => {
    const child = spawn("node", [PROBE], {
      env: { ...process.env, ...env },
    });
    let buf = `\n${"=".repeat(60)}\n${label}\n${"=".repeat(60)}\n`;
    child.stdout.on("data", (d) => (buf += d));
    child.stderr.on("data", (d) => (buf += d));
    child.on("close", () => resolve(buf));
    // A hung probe must not leave the result permanently pending.
    setTimeout(() => child.kill("SIGKILL"), 5 * 60 * 1000).unref();
  });
}

(async () => {
  // Headless only. On Azure, headed via xvfb made no difference — the block is
  // the IP, not how the browser reports itself — so this skips the xvfb setup.
  const headless = await run("Playwright Chromium — headless", { HEADED: "" });
  output = headless;
  done = true;
  console.log(output);
})();

createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end(
    `noon access probe — Railway\n` +
      `status: ${done ? "complete" : "running"}\n` +
      output,
  );
}).listen(PORT, () => console.log(`probe result served on :${PORT}`));
