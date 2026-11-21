// 校验：
//   1) package.json 关键字段（包名、依赖、files 清单里的文件都在）；
//   2) 补丁能解析，且有一条 preset-rea 声明；
//   3) 预设行与内置 standard 预设一一对应（除 REA 自身的 mcp-rea），保证选了 REA 不丢能力；
//   4) 两条 !!js 表达式能解析出 rea-agents 的入口与 skill 目录，且 node.exe 版本满足 REA 要求。
//
// 说明：dsh 安装目录在 app.asar 里，普通 Node 看不见，所以「随包 skill 目录」那一行
// 只做表达式的文本比对，不做存在性检查——那条表达式与内置 standard 预设逐字相同。
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const HERE = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const PROFILE = join(process.env.USERPROFILE, ".dsh", "profiles", "desktop");
const YAML = createRequire(join(PROFILE, "package.json"))("yaml");

let bad = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? " = " + detail : ""}`);
  if (!ok) bad++;
};

// ── 1) package.json ─────────────────────────────────────────────────────────
const pkg = JSON.parse(readFileSync(join(HERE, "package.json"), "utf8"));
check(pkg.name === "dsh-preset-rea", "包名是 dsh-preset-rea", pkg.name);
check(typeof pkg.version === "string" && pkg.version.length > 0, "有 version", pkg.version);
check(pkg.license === "MIT", "有 license", pkg.license);
check(typeof pkg.dependencies?.["rea-agents"] === "string", "声明了 rea-agents 依赖", pkg.dependencies?.["rea-agents"]);
for (const f of pkg.files ?? []) check(existsSync(join(HERE, f)), `files 里的 ${f} 存在`);
check(pkg.dsh?.bundle?.patch === "./cordis.patch.yml", "dsh.bundle.patch 指向补丁", pkg.dsh?.bundle?.patch);

// ── 2) 补丁结构 ─────────────────────────────────────────────────────────────
const STANDARD = [
  "persona", "agent-instructions", "time-context", "tool-bash", "tool-pwsh", "tool-fs",
  "tool-fs-search", "tool-jobs", "tool-schedule", "skill-filesystem", "tool-skill",
  "command-goal", "tool-goal", "planning", "compaction", "delegation", "tool-ask-user",
  "tool-todo", "tool-web", "present", "tool-office", "tool-plugin-manager",
];
const REA_ONLY = ["mcp-rea"];

const jsTag = { tag: "tag:yaml.org,2002:js", resolve: (v) => v };
const patch = YAML.parse(readFileSync(join(HERE, "cordis.patch.yml"), "utf8"), { customTags: [jsTag] });
const preset = patch.flatMap((r) => r.insert ?? []).find((r) => r.id === "preset-rea");
if (!preset) { console.error("FAIL: 没有 preset-rea 行"); process.exit(1); }

const cfg = preset.config;
const ids = cfg.plugins.map((p) => p.id);
console.log(`preset id=${cfg.id} name=${cfg.name} order=${cfg.order} plugins=${ids.length}`);

for (const id of STANDARD) if (!ids.includes(id)) { console.error("FAIL: 缺少 standard 能力行 " + id); bad++; }
for (const id of ids) if (!STANDARD.includes(id) && !REA_ONLY.includes(id)) { console.error("FAIL: 多出未预期行 " + id); bad++; }
check(cfg.id === "rea", "预设 id 仍是 rea", cfg.id);

// ── 3) 路径解析 ─────────────────────────────────────────────────────────────
const baseUrl = "file:///" + PROFILE.replace(/\\/g, "/") + "/package.json";
const ctx = { get: () => null };
const evalJs = (src) => new Function("baseUrl", "ctx", "process", `return (${src});`)(baseUrl, ctx, process);

const mcp = cfg.plugins.find((p) => p.id === "mcp-rea");
const skill = cfg.plugins.find((p) => p.id === "skill-filesystem");

check(
  skill.config.customSkillDirs[0] ===
    "process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@deepseek-ai/dsh-agent-preset/package.json')), 'skills')",
  "skills[0] 与 standard 预设逐字一致",
);

const command = evalJs(mcp.config.command);
const entry = evalJs(mcp.config.args[0]);
const reaSkillDir = evalJs(skill.config.customSkillDirs[1]);

const nodeVer = existsSync(command) ? execFileSync(command, ["-v"], { encoding: "utf8" }).trim() : null;
const [maj, min] = nodeVer?.replace(/^v/, "").split(".").map(Number) ?? [];
const nodeOk = (maj === 22 && min >= 23) || (maj === 24 && min >= 22) || maj >= 26;
check(nodeOk && Boolean(nodeVer), "command 指向满足 REA 要求的 node", `${command} (${nodeVer ?? "missing"})`);

check(existsSync(entry), "rea.mjs 可解析", entry);
check(existsSync(join(reaSkillDir, "reverse-engineer-anything", "SKILL.md")), "REA SKILL.md 存在", join(reaSkillDir, "reverse-engineer-anything", "SKILL.md"));

console.log(bad ? `\n${bad} 项失败` : "\n全部通过");
process.exit(bad ? 1 : 0);
