# Claude Code Journal

> Local analytics & daily journal for [Claude Code](https://claude.com/claude-code) — sessions, token usage, a GitHub-style heatmap dashboard, and "what did I do today" reports.

**🔒 100% local & offline.** It parses the session transcripts Claude Code already keeps on your machine (`~/.claude/projects/**/*.jsonl`). Nothing is uploaded, no API key is required, no telemetry.

[中文文档 →](README.zh-CN.md)

![Dashboard](https://raw.githubusercontent.com/pickjason/cc-journal/main/docs/screenshot.png)

## Quick Start

```bash
npx cc-journal serve
```

That's it — your dashboard opens at `http://localhost:3777`. First run parses all transcripts (a few seconds); afterwards refreshes are incremental and instant.

Or install globally:

```bash
npm i -g cc-journal
journal serve
```

## Features

- **Activity heatmap** — GitHub-style yearly calendar; switch metric between total tokens / output tokens / sessions / prompts; click any day for details
- **Daily token trend** — input / output / cache-write / cache-read as stacked bars (cache series hidden by default — they're ~100× larger and would flatten everything else)
- **Hourly activity** — see when you actually work
- **Top projects & model breakdown** — by output tokens
- **Day detail** — every session with time range, project, first prompt, and token cost
- **Daily reports** — rule-based extraction of what you did each day (free, instant), plus an optional **LLM-condensed version** generated through your local `claude` CLI (uses your existing subscription; no API key). LLM reports are cached per day
- **Bilingual UI** — English / 中文, auto-detected, switchable, `?lang=en|zh`

## Commands

```bash
journal serve   [--port 3777] [--no-open]          # local dashboard
journal stats   [--days 30]                        # terminal overview
journal summary [--date YYYY-MM-DD] [--llm] [--model haiku]   # daily report
journal refresh                                    # update the parse cache
# global: --lang zh|en · --claude-dir <dir> · --data-dir <dir>
```

## How it works

- Reads `~/.claude/projects/**/*.jsonl` (including subagent transcripts under `<session>/subagents/`), streaming line by line.
- Parsed results are cached in `~/.claude-journal/` with incremental updates (file size + mtime). **History accumulates**: Claude Code deletes transcripts older than 30 days by default (`cleanupPeriodDays`), but cc-journal keeps the parsed history of deleted files, so your heatmap keeps growing from the day you first run it.
- The dashboard is a single static page + tiny JSON API on `127.0.0.1` — no framework, no build step at runtime, ECharts bundled locally (no CDN).

## Accuracy notes

Numbers are easy to get wrong with Claude Code transcripts. cc-journal:

- counts **input / output / cache-creation / cache-read tokens separately** (mixing them inflates totals ~100×);
- dedupes usage by `message.id + requestId` — one API response spans multiple transcript lines, each repeating the full usage block;
- dedupes globally across files — forked/resumed sessions copy history;
- counts subagent usage into totals but **not** as separate sessions;
- counts only human prompts (filters command echoes, hook outputs, tool results);
- buckets days/hours in **your local timezone**;
- excludes its own LLM-report sessions (tagged `[journal-summary]`) so the tool doesn't pollute its own stats.

## FAQ

**Do I need the `claude` CLI?**
Only for `--llm` reports. Everything else works standalone.

**Why does my data only go back ~30 days at first?**
Claude Code cleans up old transcripts (`cleanupPeriodDays` in `~/.claude/settings.json`). From your first run onward, cc-journal preserves parsed history even after the source files are cleaned.

**Where is my data stored?**
`~/.claude-journal/` (cache + generated reports). Delete it any time; everything except cleaned-up history is rebuilt on the next run.

## License

[MIT](LICENSE)
