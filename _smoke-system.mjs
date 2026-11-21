// 冒烟测试：用 PATH 上的系统 Node 起 REA MCP，握手 + tools/list。
// 入口按补丁同样的顺序解析：先找已安装的 rea-agents 包，再退回 bundle 内的 vendor/。
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";

const HERE = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const PROFILE = join(process.env.USERPROFILE, ".dsh", "profiles", "desktop");

function resolveEntry() {
  for (const anchor of [join(PROFILE, "package.json"), join(HERE, "package.json")]) {
    try { return createRequire(anchor).resolve("rea-agents/scripts/rea.mjs"); } catch {}
  }
  const vendored = join(HERE, "vendor", "node_modules", "rea-agents", "scripts", "rea.mjs");
  return existsSync(vendored) ? vendored : null;
}

const entry = resolveEntry();
if (!entry) {
  console.error("FAIL: 找不到 rea-agents/scripts/rea.mjs（既没安装，也没有 vendor/）");
  process.exit(1);
}
console.log("entry =", entry);

const child = spawn("node", [entry, "mcp"], {
  stdio: ["pipe", "pipe", "pipe"],
  cwd: HERE,
  env: { ...process.env, REA_MCP_TOOL_CATALOG_PROFILE: "hot-cold", REA_MCP_INPUT_SCHEMA_PROFILE: "compact" },
  shell: false,
});

let out = "";
let err = "";
child.stdout.on("data", (d) => { out += d.toString(); });
child.stderr.on("data", (d) => { err += d.toString(); });

child.stdin.write(JSON.stringify({
  jsonrpc: "2.0", id: 1, method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "system-node-smoke", version: "0" } },
}) + "\n");

setTimeout(() => {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");
}, 4000);

setTimeout(() => {
  let version = null;
  let tools = null;
  for (const line of out.split("\n").filter(Boolean)) {
    try {
      const msg = JSON.parse(line);
      if (msg.id === 1) version = msg.result?.serverInfo?.version;
      if (msg.id === 2) tools = msg.result?.tools?.map((t) => t.name);
    } catch {}
  }
  const ok = Boolean(version && tools?.includes("discover_tools"));
  console.log(ok ? "OK   " : "FAIL ", "system node", process.version, "| server", version, "| tools:", tools?.length, "|", tools?.join(","));
  if (err.trim()) console.log("stderr:", err.slice(0, 800));
  child.kill();
  process.exit(ok ? 0 : 1);
}, 45000);
