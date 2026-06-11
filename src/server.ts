import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { aggregate } from "./aggregate.js";
import { refresh } from "./cache.js";
import { detectLang, type Lang } from "./i18n.js";
import { buildDayMaterial, llmSummary, ruleSummary } from "./summary.js";
import type { AggregateResult, ParsedFile } from "./types.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const REFRESH_INTERVAL_MS = 15_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MODEL_RE = /^[\w.-]+$/;

export function startServer(opts: {
  port: number;
  claudeDir: string;
  dataDir: string;
  webDir: string;
}): Promise<http.Server> {
  let agg: AggregateResult | null = null;
  let files: ParsedFile[] = [];
  let lastRefresh = 0;
  let refreshing: Promise<AggregateResult> | null = null;
  // 同一天的 LLM 日报只允许一个生成中的请求,避免重复烧用量
  const inflight = new Map<string, Promise<string>>();

  async function getAgg(force = false): Promise<AggregateResult> {
    if (!force && agg && Date.now() - lastRefresh < REFRESH_INTERVAL_MS) return agg;
    if (!refreshing) {
      refreshing = (async () => {
        files = await refresh(opts.claudeDir, opts.dataDir);
        agg = aggregate(files);
        lastRefresh = Date.now();
        refreshing = null;
        return agg;
      })();
    }
    return refreshing;
  }

  function llmCachePath(date: string, lang: Lang): string {
    return path.join(opts.dataDir, "summaries", `${date}-llm.${lang}.md`);
  }

  async function handleSummary(url: URL): Promise<{ status: number; body: unknown }> {
    const date = url.searchParams.get("date") ?? "";
    if (!DATE_RE.test(date)) return { status: 400, body: { error: "invalid date" } };
    const wantLlm = url.searchParams.get("llm") === "1";
    const force = url.searchParams.get("force") === "1";
    const model = url.searchParams.get("model") ?? "haiku";
    if (!MODEL_RE.test(model)) return { status: 400, body: { error: "invalid model" } };
    const lang = detectLang(url.searchParams.get("lang") ?? undefined);

    const aggNow = await getAgg();
    const material = buildDayMaterial(files, date);

    if (!wantLlm) {
      let hasLlm = false;
      try {
        await fsp.access(llmCachePath(date, lang));
        hasLlm = true;
      } catch {
        // 无缓存
      }
      return {
        status: 200,
        body: { date, llm: false, cached: false, hasLlm, markdown: ruleSummary(aggNow, material, date, lang) },
      };
    }

    const cacheFile = llmCachePath(date, lang);
    if (!force) {
      try {
        const md = await fsp.readFile(cacheFile, "utf8");
        return { status: 200, body: { date, llm: true, cached: true, markdown: md } };
      } catch {
        // 无缓存 → 生成
      }
    }

    const key = `${date}:${model}:${lang}`;
    let pending = inflight.get(key);
    if (!pending) {
      pending = (async () => {
        try {
          const md = await llmSummary(aggNow, material, date, model, lang);
          await fsp.mkdir(path.dirname(cacheFile), { recursive: true });
          await fsp.writeFile(cacheFile, md);
          return md;
        } finally {
          inflight.delete(key);
        }
      })();
      inflight.set(key, pending);
    }
    const md = await pending;
    return { status: 200, body: { date, llm: true, cached: false, markdown: md } };
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (url.pathname === "/api/stats") {
        const data = await getAgg(url.searchParams.get("refresh") === "1");
        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(data));
        return;
      }

      if (url.pathname === "/api/summary") {
        const { status, body } = await handleSummary(url);
        res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(body));
        return;
      }

      const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const file = path.normalize(path.join(opts.webDir, rel));
      if (!file.startsWith(opts.webDir)) {
        res.writeHead(403).end("Forbidden");
        return;
      }
      try {
        const content = await fsp.readFile(file);
        res.writeHead(200, {
          "content-type": MIME[path.extname(file)] ?? "application/octet-stream",
        });
        res.end(content);
      } catch {
        res.writeHead(404).end("Not Found");
      }
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: String(e instanceof Error ? e.message : e) }));
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, "127.0.0.1", () => resolve(server));
  });
}
