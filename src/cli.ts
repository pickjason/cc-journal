#!/usr/bin/env node
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { aggregate } from "./aggregate.js";
import { refresh } from "./cache.js";
import { CLI, detectLang, type Lang } from "./i18n.js";
import { startServer } from "./server.js";
import { buildDayMaterial, llmSummary, ruleSummary } from "./summary.js";
import type { AggregateResult, Usage } from "./types.js";
import { addUsage, emptyUsage, fmtTokens, todayLocal, totalTokens } from "./util.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const program = new Command();
program
  .name("journal")
  .description("Claude Code usage analytics & daily journal / Claude Code 使用统计与日报工具")
  .option("--claude-dir <dir>", "Claude data dir", path.join(os.homedir(), ".claude"))
  .option("--data-dir <dir>", "journal cache dir", path.join(os.homedir(), ".claude-journal"))
  .option("--lang <lang>", "output language: zh | en (default: auto-detect)");

function ctx(): { claudeDir: string; dataDir: string; lang: Lang } {
  const o = program.opts();
  return { claudeDir: o.claudeDir, dataDir: o.dataDir, lang: detectLang(o.lang) };
}

function progressLogger(lang: Lang) {
  return (done: number, total: number, file: string) => {
    const name = path.basename(file);
    process.stderr.write(`\r${CLI[lang].parsing} ${done}/${total} ${name.slice(0, 50).padEnd(50)}`);
    if (done === total) process.stderr.write("\n");
  };
}

async function loadAgg(): Promise<AggregateResult> {
  const { claudeDir, dataDir, lang } = ctx();
  const files = await refresh(claudeDir, dataDir, progressLogger(lang));
  return aggregate(files);
}

/** 汇总 [from, to] 闭区间内的天 */
function rangeStats(agg: AggregateResult, from: string, to: string) {
  const usage: Usage = emptyUsage();
  let userMessages = 0;
  let sessions = 0;
  for (const [day, d] of Object.entries(agg.days)) {
    if (day < from || day > to) continue;
    addUsage(usage, d.usage);
    userMessages += d.userMessages;
  }
  for (const s of agg.sessions) {
    if (s.days.some((day) => day >= from && day <= to)) sessions++;
  }
  return { usage, userMessages, sessions };
}

function dayOffset(base: string, offset: number): string {
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function openBrowser(url: string): void {
  const cmds: Partial<Record<NodeJS.Platform, [string, string[]]>> = {
    darwin: ["open", [url]],
    win32: ["cmd", ["/c", "start", "", url]],
  };
  const [cmd, args] = cmds[process.platform] ?? ["xdg-open", [url]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {});
}

program
  .command("refresh")
  .description("rebuild / incrementally update the parse cache")
  .action(async () => {
    const { lang } = ctx();
    const agg = await loadAgg();
    console.log(
      CLI[lang].refreshDone({
        sessions: agg.totals.sessions,
        projects: agg.totals.projects,
        activeDays: agg.totals.activeDays,
        start: agg.rangeStart ?? "-",
        end: agg.rangeEnd ?? "-",
      })
    );
  });

program
  .command("stats")
  .description("terminal stats overview")
  .option("--days <n>", "window size in days for rankings", "30")
  .action(async (opts: { days: string }) => {
    const { lang } = ctx();
    const t = CLI[lang];
    const agg = await loadAgg();
    const today = todayLocal();
    const windowDays = Math.max(1, parseInt(opts.days, 10) || 30);

    console.log("");
    console.log(`  ${t.statsTitle}`);
    console.log(
      `  ${t.statsOverview({
        start: agg.rangeStart ?? "-",
        end: agg.rangeEnd ?? "-",
        projects: agg.totals.projects,
        sessions: agg.totals.sessions,
        prompts: agg.totals.userMessages,
        output: fmtTokens(agg.totals.usage.output),
      })}`
    );
    console.log("");

    const rows: Array<[string, string]> = [
      [t.today, today],
      [t.lastNDays(7), dayOffset(today, -6)],
      [t.lastNDays(windowDays), dayOffset(today, -(windowDays - 1))],
    ];

    console.log(t.statsHeader);
    for (const [label, from] of rows) {
      const r = rangeStats(agg, from, today);
      console.log(
        `  ${label.padEnd(t.labelWidth)}${String(r.sessions).padStart(4)}  ${String(r.userMessages).padStart(5)}  ` +
          `${fmtTokens(r.usage.output).padStart(8)}  ${fmtTokens(r.usage.input).padStart(8)}  ` +
          `${fmtTokens(r.usage.cacheCreation + r.usage.cacheRead).padStart(9)}`
      );
    }

    console.log("");
    console.log(`  ${t.last14Title}`);
    const barDays: string[] = [];
    for (let i = 13; i >= 0; i--) barDays.push(dayOffset(today, -i));
    const values = barDays.map((d) => agg.days[d]?.usage.output ?? 0);
    const max = Math.max(...values, 1);
    for (let i = 0; i < barDays.length; i++) {
      const v = values[i];
      const n = Math.round((v / max) * 24);
      const bar = "█".repeat(n) || (v > 0 ? "▁" : "");
      console.log(`  ${barDays[i].slice(5)}  ${bar.padEnd(25)}${v > 0 ? fmtTokens(v) : "-"}`);
    }

    console.log("");
    console.log(`  ${t.topProjectsTitle(windowDays)}`);
    const from = dayOffset(today, -(windowDays - 1));
    const projTotals = new Map<string, { usage: Usage; sessions: Set<string> }>();
    for (const [day, d] of Object.entries(agg.days)) {
      if (day < from || day > today) continue;
      for (const [p, bp] of Object.entries(d.byProject)) {
        let tp = projTotals.get(p);
        if (!tp) {
          tp = { usage: emptyUsage(), sessions: new Set() };
          projTotals.set(p, tp);
        }
        addUsage(tp.usage, bp.usage);
      }
    }
    for (const s of agg.sessions) {
      if (s.days.some((day) => day >= from && day <= today)) {
        projTotals.get(s.project)?.sessions.add(s.id);
      }
    }
    const top = [...projTotals.entries()]
      .sort((a, b) => b[1].usage.output - a[1].usage.output)
      .slice(0, 10);
    for (const [name, tp] of top) {
      console.log(
        `  ${name.padEnd(28)}${t.projectRow({
          sessions: tp.sessions.size,
          output: fmtTokens(tp.usage.output),
          total: fmtTokens(totalTokens(tp.usage)),
        })}`
      );
    }
    console.log("");
  });

program
  .command("serve")
  .description("start the local dashboard")
  .option("--port <port>", "port", "3777")
  .option("--no-open", "do not open the browser")
  .action(async (opts: { port: string; open: boolean }) => {
    const { claudeDir, dataDir, lang } = ctx();
    const t = CLI[lang];
    const port = parseInt(opts.port, 10) || 3777;
    // 先做一次刷新,首启全量解析有进度提示
    console.log(t.serving);
    const files = await refresh(claudeDir, dataDir, progressLogger(lang));
    const agg = aggregate(files);
    console.log(
      t.dataReady({
        sessions: agg.totals.sessions,
        activeDays: agg.totals.activeDays,
        output: fmtTokens(agg.totals.usage.output),
      })
    );
    await startServer({ port, claudeDir, dataDir, webDir: path.join(ROOT, "web") });
    const url = `http://localhost:${port}`;
    console.log(`${t.dashboardAt} ${url}`);
    if (opts.open) openBrowser(url);
  });

program
  .command("summary")
  .description("generate a daily work report")
  .option("--date <date>", "date YYYY-MM-DD", todayLocal())
  .option("--llm", "condense via the local claude CLI", false)
  .option("--model <model>", "LLM model", "haiku")
  .action(async (opts: { date: string; llm: boolean; model: string }) => {
    const { claudeDir, dataDir, lang } = ctx();
    const files = await refresh(claudeDir, dataDir, progressLogger(lang));
    const agg = aggregate(files);
    const material = buildDayMaterial(files, opts.date);
    if (opts.llm) {
      process.stderr.write(`${CLI[lang].generating(opts.model)}\n`);
      console.log(await llmSummary(agg, material, opts.date, opts.model, lang));
    } else {
      console.log(ruleSummary(agg, material, opts.date, lang));
    }
  });

program.parseAsync().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
