# dsh-preset-rea

把 [REA（Reverse Engineer Anything）](https://github.com/morluto/rea) 做成 DeepSeek Harness 的一个**可选预设模式**。

只有在新建会话时选中「REA 逆向」，才会挂载 REA 的 skill 和 `mcp__rea__*` 工具；standard / minimal / 其它预设完全看不到这些工具，会话开销为零。

## 前置要求

| 项 | 要求 |
|---|---|
| DSH | 0.2.2-rc.5（在 Desktop 版上验证） |
| Node.js | **≥ 24.22.1**（或 22.23.4+、26.12.1+）。REA 6.8+ 有硬门槛，低于它的 Node 会在 MCP 启动时报错 |
| 网络 | 首次安装需要，用于拉取 `rea-agents` |
| REA 分析引擎 | 可选。Hopper / Ghidra / IDA / JADX 等不随本预设安装；静态 JavaScript / Electron 分析不需要引擎 |

注意：桌面版 Electron 内置的 Node 是 24.21.0，**不满足**。但那是 DSH 主进程用的，REA MCP 是 `dsh-mcp-client` 另起的子进程，走 PATH 上的 `node`，所以只要系统 Node 达标即可。

## 安装

```text
plugin_manager(action: "install_bundle", target: "github:ao882866-ux/dsh-preset-rea")
```

装完重启 DSH，在**新会话**的预设下拉里选「REA 逆向」。

卸载：

```text
plugin_manager(action: "remove_bundle", target: "dsh-preset-rea")
```

## 它挂载了什么

预设内与 REA 相关的只有两条行，其余行与内置 `standard` 预设逐一对应（shell / 文件 / job / plan / compaction / subagent / workflow / web / office），所以选了它不会丢掉日常编码能力。

| 行 | 作用 |
|---|---|
| `skill-filesystem` | 在 standard 的随包 skill 目录之外，再加一条 `rea-agents/skills`，于是会话里多出 `reverse-engineer-anything` 这个 skill |
| `mcp-rea` | 以 stdio 启动 `rea-agents mcp`，工具以 `mcp__rea__<name>` 注册 |

`rea-agents` 是 `package.json` 里的普通依赖（`6.10.1`），安装 bundle 时由包管理器装好。运行时解析顺序：

1. 从 profile 解析 `rea-agents/package.json`（GitHub 安装的情形）
2. 退回 bundle 内的 `vendor/node_modules/rea-agents`（本地 `link:` 开发安装，没有依赖解析）

skill 目录取自 `rea-agents` 包本身，所以 skill 描述的工具清单永远和实际 MCP 服务器同版本。

## 为什么用 hot-cold 目录

REA 默认一次性广播 263 个工具，`tools/list` 约 340 KB —— 每次请求都进上下文。本预设设了两个环境变量：

| 变量 | 值 | 效果 |
|---|---|---|
| `REA_MCP_TOOL_CATALOG_PROFILE` | `hot-cold` | 初始只广播 `open_binary` / `binary_session` / `close_binary` / `get_evidence_bundle` / `discover_tools`（5 个，约 7.5 KB） |
| `REA_MCP_INPUT_SCHEMA_PROFILE` | `compact` | 输入 schema 走紧凑档，进一步降体积 |

其余工具由 `mcp__rea__discover_tools` 按 family 装载，装载后服务端发 `tools/list_changed`，`dsh-mcp-client` 会重新 sync 工具表，不需要重连。

想换回「一次全给」，把 `cordis.patch.yml` 里 `mcp-rea` 的 `REA_MCP_TOOL_CATALOG_PROFILE` 改成 `full`（代价是每次请求约 340 KB 的 schema）。
只想收窄某些方向，还可以加 `REA_MCP_TOOL_FAMILIES`（如 `session,application`），263 → 59 个工具。

## 开发

```powershell
# 校验补丁结构、与 standard 预设的能力对齐、Node 版本与路径解析
node _verify.mjs

# 冒烟测试：用系统 node 起 REA MCP，握手 + tools/list
node _smoke-system.mjs
```

`vendor/` 与 `node_modules/` 已在 `.gitignore` 里：发布产物由 `package.json` 的 `dependencies` 提供 `rea-agents`，仓库本身不含它。本地 `link:` 安装没有依赖解析，才靠 `vendor/` 兜底。

## 许可

本预设的编排代码（`cordis.patch.yml`、脚本）为 MIT。

REA 本身是 [morluto/rea](https://github.com/morluto/rea) 的 MIT 项目，通过 npm 依赖 `rea-agents` 使用，本仓库不重分发其代码或二进制。
