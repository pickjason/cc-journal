# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目

**cc-journal**(npm 包名;仓库 pickjason/cc-journal)— Claude Code 使用统计与日报工具:解析本地 `~/.claude/projects/**/*.jsonl` 会话记录(完全离线,不上传),统计每天的会话数/指令数/token 消耗,提供 GitHub 风格热力图 Dashboard 与"每天干了什么"日报(规则提取 + 可选本机 `claude -p` 浓缩)。Node 20+ / TypeScript / 零框架前端(原生 JS + ECharts 本地 vendor,无 CDN),唯一运行时依赖 `commander`。开源(MIT),目标使用方式 `npx cc-journal serve`。

## 命令

```bash
npm install
npm run build        # tsc → dist/
npm run dev -- <子命令>   # tsx 直跑 src/cli.ts
npm run stats        # = journal stats
npm run serve        # = journal serve(默认 http://localhost:3777,darwin 自动 open)

npx tsx src/cli.ts refresh                              # 增量更新解析缓存
npx tsx src/cli.ts stats [--days 30]
npx tsx src/cli.ts serve [--port 3777] [--no-open]
npx tsx src/cli.ts summary [--date YYYY-MM-DD] [--llm] [--model haiku]
# 全局选项:--lang zh|en(默认按 locale 检测)/ --claude-dir(默认 ~/.claude)/ --data-dir(默认 ~/.claude-journal)
```

`npm run build` = `tsc` + `scripts/copy-vendor.mjs`(把 echarts 拷到 `web/vendor/`,gitignore);`prepare` 钩子在 install/publish 时自动构建。bin 名 `cc-journal` 和 `journal`。无测试框架(新增测试先与用户确认选型)。

## 架构(数据流)

```
~/.claude/projects/**/*.jsonl
  → scanner.ts(递归扫描;子代理转录在 <session>/subagents/agent-*.jsonl)
  → parser.ts(readline 流式逐行解析 → ParsedFile)
  → cache.ts(增量缓存 data/cache.json,按 size+mtime 判断变化)
  → aggregate.ts(天/会话/项目/模型/小时 聚合 → AggregateResult)
  → cli.ts(stats 终端输出)/ server.ts(/api/* + web/ 静态)/ summary.ts(日报)
```

| 文件 | 职责 | 关键点 |
| --- | --- | --- |
| `src/types.ts` | 全部接口定义 | `Usage` 四项分开;`ParsedFile` 是缓存单元 |
| `src/i18n.ts` | CLI/日报双语 | `detectLang()`:--lang > JOURNAL_LANG > LC_*/LANG > Intl;`CLI`/`SUM` 字典 |
| `src/parser.ts` | jsonl → `ParsedFile` | `SKIP_PREFIXES` 过滤非人工 user 行;`EXCLUDE_MARKER` |
| `src/cache.ts` | 增量缓存 | `CACHE_VERSION`;源文件消失仍保留历史(见红线) |
| `src/aggregate.ts` | 聚合 + 全局去重 | `seenEvent`/`seenUserMsg` 跨文件去重 |
| `src/summary.ts` | 规则/LLM 日报 | `runClaude()` spawn 本机 `claude -p --model <m>` |
| `src/server.ts` | http 服务 | `/api/stats`、`/api/summary`(LLM 结果缓存 + inflight 去重) |
| `web/app.js` | Dashboard 全部逻辑 | 文案集中在顶部 `I18N` 字典(zh/en) |

### 统计口径(数字准确性的根基,改动前必须理解)

- **token 四项分开**:`input` / `output` / `cacheCreation` / `cacheRead`——cache 量级远大于 input/output(实测约 300:1),混算即失真;Dashboard 趋势图默认隐藏两个 cache 序列(图例可开)。
- **同一 API 响应去重**:一次响应的多个 content block 在 jsonl 中各占一行且**重复携带完整 usage**,parser 按 `message.id + requestId` 文件内去重;fork/resume 会把历史行复制进新文件,aggregate 再做**跨文件全局去重**(按 `firstTs` 排序,用量归属最早出现的会话)。
- **子代理(sidechain)**:`isSidechain: true` 的行,以及 `agent-*.jsonl` / `subagents/` 路径下的整个文件(`forceSidechain`),用量**计入总量**并在 `sidechain` 字段单独累计,但**不算独立会话**。
- **指令数**只统计人工输入:`type=user` 且非 `isMeta`,过滤 `SKIP_PREFIXES`(命令回显、hook 输出、`<task-notification>`、续聊摘要等)。
- **时区**:timestamp 是 UTC,统一按本地时区归天/归小时(`localDay`/`localHour`)。
- **自指排除**:LLM 日报的 prompt 以 `[journal-summary]` 开头,parser 检测到首条用户消息带此标记即整会话 `excluded`,不进任何统计。

### Dashboard(`web/`)

- `/api/stats` 返回完整 `AggregateResult`(15 秒内存节流);`/api/summary?date=&llm=0|1&force=0|1&model=&lang=zh|en` 返回日报 JSON。
- 规则日报每次现生成(零成本);LLM 日报按语言缓存在 `<dataDir>/summaries/<date>-llm.<lang>.md`,`force=1` 重新生成,服务端 `inflight` Map 防同日并发重复生成。
- 中英文:`I18N` 字典 + `localStorage("journal-lang")` + `?lang=zh|en` URL 参数,默认跟随浏览器语言。新增文案必须同时加 zh/en 两份。
- markdown 渲染用 `mdToHtml()`(自写极简实现,内容先 `esc()` 转义),不引第三方库。

## 红线与约定

- **`~/.claude-journal/cache.json` 是唯一的历史积累,绝不可删**:Claude Code 默认 30 天清理旧会话(`cleanupPeriodDays`),源文件消失后只有这份缓存还保留着已解析历史(`cache.ts` 刻意不删失踪文件的条目)。换机器要手动迁移该目录。
- **改 `ParsedFile` 结构必须 bump `CACHE_VERSION`**(cache.ts),否则旧缓存结构错乱;bump 后全量重建,已被清理的源文件历史会丢——结构变更要慎重,最好向后兼容。
- **LLM 日报 prompt 必须保持 `[journal-summary]` 开头**(summary.ts),去掉会让工具自己产生的会话污染统计。
- LLM 调用走本机 `claude` CLI(订阅),**不直连 API、不引 SDK、不配 key**;默认模型 `haiku`。
- **每日工作日志**:写到 `docs/progress/YYYY-MM-DD-<主题>.md`(每主题一文件 + day-summary),禁放密钥/凭据。**仅本地保留,已 gitignore,不推送到公开仓库**。
- 生成文档**只用源码中真实存在的术语**(会话/指令/规则日报/LLM 日报/子代理…),不编造业务名词。

## 文档地图

`README.md`(中文,默认展示,首屏 npx + 截图 + 隐私声明)· `README.en.md`(英文版,内容对齐)· `docs/screenshot.png`(README 配图,Chrome headless 截取)· `docs/progress/`(每日工作日志,仅本地不入库)· 本文件(面向开发,架构与红线)。两份 README 改动须同步。
