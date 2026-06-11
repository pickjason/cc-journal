/* Claude Code Journal Dashboard */
"use strict";

const $ = (s) => document.querySelector(s);
const charts = {};
let DATA = null;
const state = { year: null, metric: "totalTokens", day: null, lang: "zh" };

const DARK = {
  text: "#e6edf3",
  muted: "#8b949e",
  border: "#30363d",
  bg: "#161b22",
  greens: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
  series: ["#58a6ff", "#39d353", "#d29922", "#bc8cff", "#f85149", "#76e3ea"],
};

/* ---------- i18n ---------- */

const I18N = {
  zh: {
    chipSessions: "会话",
    chipActiveDays: "活跃天",
    chipProjects: "项目",
    chipPrompts: "指令",
    chipOutput: "输出 tokens",
    chipTotal: "总 tokens",
    lblYear: "年份",
    lblMetric: "热力图指标",
    metricOptions: {
      totalTokens: "总 tokens",
      output: "输出 tokens",
      sessions: "会话数",
      userMessages: "指令数",
    },
    heatmapTitle: (y, m) => `${y} 活跃热力图 · ${m}`,
    heatTip: (day, d) =>
      `<b>${day}</b><br/>会话 ${d.sessions} · 指令 ${d.userMessages}<br/>` +
      `输出 ${fmt(d.usage.output)} · 总 ${fmt(totalTokens(d.usage))} tokens`,
    h2Trend: "每日 token 趋势",
    h2Hours: "时段分布(几点最肝)",
    h2Projects: "项目排行(输出 tokens)",
    h2Models: "模型分布(输出 tokens)",
    sOutput: "输出",
    sInput: "输入",
    sCacheWrite: "cache 创建",
    sCacheRead: "cache 读取",
    hoursTip: (h, v) => `${h} 点:${v} 条消息`,
    dayTitle: (d) => `当日明细 · ${d}`,
    daySummary: (d) =>
      `<b>${d.sessions}</b> 个会话 · <b>${d.userMessages}</b> 条指令 · ` +
      `输出 <b>${fmt(d.usage.output)}</b> / 输入 <b>${fmt(d.usage.input)}</b> / ` +
      `cache <b>${fmt(d.usage.cacheCreation + d.usage.cacheRead)}</b> tokens` +
      (d.sidechain.output > 0 ? ` · 其中子代理输出 ${fmt(d.sidechain.output)}` : ""),
    sessionStats: (s) =>
      `${s.userMessages} 条指令 · 输出 ${fmt(s.usage.output)} · 输入 ${fmt(s.usage.input)} · ` +
      `cache ${fmt(s.usage.cacheCreation + s.usage.cacheRead)} tokens`,
    noActivity: "这一天没有使用记录",
    noSessions: "这一天没有会话",
    untitled: "(无标题)",
    footer: "数据来源:~/.claude/projects · 本地离线解析,不上传任何数据",
    reportTitle: "📝 日报",
    sessionsTitle: (n) => `💬 会话(${n})`,
    btnLlm: "✨ LLM 日报",
    btnRegen: "重新生成",
    generating: "生成中…(约 20–60 秒,调用本机 claude)",
    cachedTag: "(缓存)",
    ruleTag: "规则提取 · 点右侧按钮生成 LLM 版",
    reportFailed: (m) => `生成失败:${m}`,
    calendarNameMap: "ZH",
    htmlLang: "zh-CN",
  },
  en: {
    chipSessions: "sessions",
    chipActiveDays: "active days",
    chipProjects: "projects",
    chipPrompts: "prompts",
    chipOutput: "output tokens",
    chipTotal: "total tokens",
    lblYear: "Year",
    lblMetric: "Heatmap metric",
    metricOptions: {
      totalTokens: "Total tokens",
      output: "Output tokens",
      sessions: "Sessions",
      userMessages: "Prompts",
    },
    heatmapTitle: (y, m) => `${y} Activity Heatmap · ${m}`,
    heatTip: (day, d) =>
      `<b>${day}</b><br/>${d.sessions} sessions · ${d.userMessages} prompts<br/>` +
      `out ${fmt(d.usage.output)} · total ${fmt(totalTokens(d.usage))} tokens`,
    h2Trend: "Daily Token Trend",
    h2Hours: "Hourly Activity",
    h2Projects: "Top Projects (output tokens)",
    h2Models: "Models (output tokens)",
    sOutput: "Output",
    sInput: "Input",
    sCacheWrite: "Cache write",
    sCacheRead: "Cache read",
    hoursTip: (h, v) => `${h}:00 — ${v} messages`,
    dayTitle: (d) => `Day Detail · ${d}`,
    daySummary: (d) =>
      `<b>${d.sessions}</b> sessions · <b>${d.userMessages}</b> prompts · ` +
      `out <b>${fmt(d.usage.output)}</b> / in <b>${fmt(d.usage.input)}</b> / ` +
      `cache <b>${fmt(d.usage.cacheCreation + d.usage.cacheRead)}</b> tokens` +
      (d.sidechain.output > 0 ? ` · subagent out ${fmt(d.sidechain.output)}` : ""),
    sessionStats: (s) =>
      `${s.userMessages} prompts · out ${fmt(s.usage.output)} · in ${fmt(s.usage.input)} · ` +
      `cache ${fmt(s.usage.cacheCreation + s.usage.cacheRead)} tokens`,
    noActivity: "No activity on this day",
    noSessions: "No sessions on this day",
    untitled: "(untitled)",
    footer: "Data source: ~/.claude/projects · parsed locally, nothing is uploaded",
    reportTitle: "📝 Daily Report",
    sessionsTitle: (n) => `💬 Sessions (${n})`,
    btnLlm: "✨ LLM Report",
    btnRegen: "Regenerate",
    generating: "Generating… (~20–60s, via local claude CLI)",
    cachedTag: "(cached)",
    ruleTag: "rule-based · click the button for the LLM version",
    reportFailed: (m) => `Failed: ${m}`,
    calendarNameMap: "EN",
    htmlLang: "en",
  },
};

function T() {
  return I18N[state.lang];
}

function detectLang() {
  const url = new URLSearchParams(location.search).get("lang");
  if (url && I18N[url]) return url;
  const saved = localStorage.getItem("journal-lang");
  if (saved && I18N[saved]) return saved;
  return (navigator.language || "").startsWith("zh") ? "zh" : "en";
}

/* ---------- 工具 ---------- */

function fmt(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function totalTokens(u) {
  return u.input + u.output + u.cacheCreation + u.cacheRead;
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hm(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function dayOf(ts) {
  const d = new Date(ts);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 同天显示 "10:02–15:28",跨天显示 "06-10 13:28 – 06-11 11:47" */
function timeRange(start, end) {
  if (dayOf(start) === dayOf(end)) return `${hm(start)}–${hm(end)}`;
  return `${dayOf(start)} ${hm(start)} – ${dayOf(end)} ${hm(end)}`;
}

/** 极简 markdown → HTML(标题/加粗/引用/列表/分割线/段落),内容先转义 */
function mdToHtml(md) {
  const out = [];
  let list = false;
  let quote = false;
  const inline = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  const closeBlocks = () => {
    if (list) { out.push("</ul>"); list = false; }
    if (quote) { out.push("</blockquote>"); quote = false; }
  };
  for (const line of md.split("\n")) {
    if (line.startsWith("### ")) { closeBlocks(); out.push(`<h5>${inline(line.slice(4))}</h5>`); }
    else if (line.startsWith("## ")) { closeBlocks(); out.push(`<h4>${inline(line.slice(3))}</h4>`); }
    else if (line.startsWith("# ")) { closeBlocks(); out.push(`<h3>${inline(line.slice(2))}</h3>`); }
    else if (/^\s*-{3,}\s*$/.test(line)) { closeBlocks(); out.push("<hr/>"); }
    else if (line.startsWith(">")) {
      if (!quote) { closeBlocks(); out.push("<blockquote>"); quote = true; }
      out.push(inline(line.replace(/^> ?/, "")) + "<br/>");
    } else if (/^[-*] /.test(line)) {
      if (!list) { closeBlocks(); out.push("<ul>"); list = true; }
      out.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (!line.trim()) {
      closeBlocks();
    } else {
      closeBlocks();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeBlocks();
  return out.join("\n");
}

function metricValue(d, metric) {
  switch (metric) {
    case "sessions": return d.sessions;
    case "userMessages": return d.userMessages;
    case "output": return d.usage.output;
    default: return totalTokens(d.usage);
  }
}

function yearDays(year) {
  return Object.entries(DATA.days).filter(([day]) => day.startsWith(String(year)));
}

function getChart(id) {
  if (!charts[id]) charts[id] = echarts.init($(`#${id}`));
  return charts[id];
}

const axisStyle = {
  axisLine: { lineStyle: { color: DARK.border } },
  axisLabel: { color: DARK.muted },
  splitLine: { lineStyle: { color: DARK.border, opacity: 0.4 } },
};

/* ---------- 静态文案 ---------- */

function applyStaticText() {
  const t = T();
  document.documentElement.lang = t.htmlLang;
  $("#lbl-year").textContent = t.lblYear;
  $("#lbl-metric").textContent = t.lblMetric;
  $("#h2-trend").textContent = t.h2Trend;
  $("#h2-hours").textContent = t.h2Hours;
  $("#h2-projects").textContent = t.h2Projects;
  $("#h2-models").textContent = t.h2Models;
  $("#footer-note").textContent = t.footer;

  const metricSel = $("#metric-select");
  metricSel.innerHTML = Object.entries(t.metricOptions)
    .map(([v, label]) => `<option value="${v}">${esc(label)}</option>`)
    .join("");
  metricSel.value = state.metric;

  $("#report-title").textContent = t.reportTitle;
  $("#btn-llm").textContent = report.mode === "llm" ? t.btnRegen : t.btnLlm;
}

/* ---------- 日报 ---------- */

const report = { day: null, mode: "rule" };

async function loadDayReport(day, opts = {}) {
  const t = T();
  report.day = day;
  const box = $("#day-report");
  const btn = $("#btn-llm");
  const status = $("#report-status");

  if (!DATA.days[day]) {
    report.mode = "rule";
    box.innerHTML = "";
    box.style.display = "none";
    btn.style.display = "none";
    status.textContent = "";
    return;
  }
  box.style.display = "";
  btn.style.display = "";

  if (opts.llm) {
    btn.disabled = true;
    status.textContent = t.generating;
  } else {
    report.mode = "rule";
    btn.textContent = t.btnLlm;
    status.textContent = "";
  }

  try {
    const q = `date=${day}&lang=${state.lang}` + (opts.llm ? `&llm=1${opts.force ? "&force=1" : ""}` : "");
    const r = await fetch(`/api/summary?${q}`);
    const data = await r.json();
    if (report.day !== day) return; // 用户已切到别的日期,丢弃过期结果
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);

    report.mode = data.llm ? "llm" : "rule";
    // 去掉日报自带的大标题与概览行:面板标题已有日期,day-summary 已有同样的统计
    const md = data.markdown
      .replace(/^# .*\n+/, "")
      .replace(/^\*\*概览\*\*.*\n+/, "")
      .replace(/^\*\*Overview\*\*.*\n+/, "")
      .replace(/^-{3,}\s*\n+/, "");
    box.innerHTML = mdToHtml(md);
    btn.disabled = false;
    btn.textContent = data.llm ? t.btnRegen : t.btnLlm;
    status.textContent = data.llm ? (data.cached ? t.cachedTag : "") : t.ruleTag;

    // 已有 LLM 缓存 → 自动加载(秒开)
    if (!data.llm && data.hasLlm) loadDayReport(day, { llm: true });
  } catch (e) {
    if (report.day !== day) return;
    btn.disabled = false;
    status.textContent = t.reportFailed(e.message);
  }
}

/* ---------- 渲染 ---------- */

function renderChips() {
  const t = T();
  const tt = DATA.totals;
  $("#chips").innerHTML = [
    `<span class="chip"><b>${tt.sessions}</b>${t.chipSessions}</span>`,
    `<span class="chip"><b>${tt.activeDays}</b>${t.chipActiveDays}</span>`,
    `<span class="chip"><b>${tt.projects}</b>${t.chipProjects}</span>`,
    `<span class="chip"><b>${tt.userMessages}</b>${t.chipPrompts}</span>`,
    `<span class="chip"><b>${fmt(tt.usage.output)}</b>${t.chipOutput}</span>`,
    `<span class="chip"><b>${fmt(totalTokens(tt.usage))}</b>${t.chipTotal}</span>`,
  ].join("");
}

function renderHeatmap() {
  const t = T();
  const days = yearDays(state.year);
  const data = days.map(([day, d]) => [day, metricValue(d, state.metric)]);
  const values = data.map((x) => x[1]).filter((v) => v > 0).sort((a, b) => a - b);
  // 用 95 分位做上限,避免单个爆量天把整年颜色压扁
  const p95 = values.length ? values[Math.floor(values.length * 0.95)] : 1;

  $("#heatmap-title").textContent = t.heatmapTitle(state.year, t.metricOptions[state.metric]);

  getChart("heatmap").setOption({
    tooltip: {
      formatter: (p) => {
        const d = DATA.days[p.data[0]];
        return d ? t.heatTip(p.data[0], d) : p.data[0];
      },
    },
    visualMap: {
      min: 0, max: Math.max(p95, 1), show: false,
      inRange: { color: DARK.greens },
    },
    calendar: {
      range: String(state.year),
      top: 30, left: 40, right: 10,
      cellSize: ["auto", 14],
      itemStyle: { borderWidth: 3, borderColor: "#161b22", color: "#0d1117" },
      splitLine: { show: false },
      dayLabel: { color: DARK.muted, nameMap: t.calendarNameMap, firstDay: 1 },
      monthLabel: { color: DARK.muted, nameMap: t.calendarNameMap },
      yearLabel: { show: false },
    },
    series: [{ type: "heatmap", coordinateSystem: "calendar", data }],
  }, true);
}

function renderTrend() {
  const t = T();
  const days = yearDays(state.year).sort((a, b) => a[0].localeCompare(b[0]));
  const x = days.map(([day]) => day.slice(5));
  const mk = (key) => days.map(([, d]) => d.usage[key]);

  getChart("trend").setOption({
    color: DARK.series,
    tooltip: {
      trigger: "axis",
      valueFormatter: (v) => fmt(v),
    },
    legend: {
      textStyle: { color: DARK.muted },
      // cache 量级远大于 input/output,默认隐藏避免压扁其他序列
      selected: { [t.sCacheRead]: false, [t.sCacheWrite]: false },
    },
    grid: { left: 60, right: 16, top: 40, bottom: 56 },
    dataZoom: [{
      type: "slider",
      startValue: Math.max(0, x.length - 60), end: 100,
      borderColor: DARK.border,
      backgroundColor: "#0d1117",
      textStyle: { color: DARK.muted },
      height: 18, bottom: 8,
    }],
    xAxis: { type: "category", data: x, ...axisStyle },
    yAxis: { type: "value", axisLabel: { color: DARK.muted, formatter: (v) => fmt(v) }, splitLine: axisStyle.splitLine },
    series: [
      { name: t.sOutput, type: "bar", stack: "t", data: mk("output") },
      { name: t.sInput, type: "bar", stack: "t", data: mk("input") },
      { name: t.sCacheWrite, type: "bar", stack: "t", data: mk("cacheCreation") },
      { name: t.sCacheRead, type: "bar", stack: "t", data: mk("cacheRead") },
    ],
  }, true);
}

function renderHours() {
  const t = T();
  const sum = new Array(24).fill(0);
  for (const [, d] of yearDays(state.year)) {
    d.hours.forEach((v, h) => (sum[h] += v));
  }
  getChart("hours").setOption({
    tooltip: { trigger: "axis", formatter: (p) => t.hoursTip(p[0].name, p[0].value) },
    grid: { left: 50, right: 16, top: 20, bottom: 30 },
    xAxis: { type: "category", data: sum.map((_, h) => h), ...axisStyle },
    yAxis: { type: "value", axisLabel: { color: DARK.muted, formatter: (v) => fmt(v) }, splitLine: axisStyle.splitLine },
    series: [{
      type: "bar",
      data: sum,
      itemStyle: { color: "#26a641", borderRadius: [3, 3, 0, 0] },
    }],
  }, true);
}

function renderProjects() {
  const totals = new Map();
  for (const [, d] of yearDays(state.year)) {
    for (const [p, bp] of Object.entries(d.byProject)) {
      totals.set(p, (totals.get(p) ?? 0) + bp.usage.output);
    }
  }
  const top = [...totals.entries()].sort((a, b) => a[1] - b[1]).slice(-12);
  getChart("projects").setOption({
    tooltip: { valueFormatter: (v) => fmt(v) },
    grid: { left: 10, right: 60, top: 10, bottom: 30, containLabel: true },
    xAxis: { type: "value", axisLabel: { color: DARK.muted, formatter: (v) => fmt(v) }, splitLine: axisStyle.splitLine },
    yAxis: { type: "category", data: top.map(([p]) => p), axisLabel: { color: DARK.text }, axisLine: axisStyle.axisLine },
    series: [{
      type: "bar",
      data: top.map(([, v]) => v),
      itemStyle: { color: "#58a6ff", borderRadius: [0, 3, 3, 0] },
      label: { show: true, position: "right", color: DARK.muted, formatter: (p) => fmt(p.value) },
    }],
  }, true);
}

function renderModels() {
  const totals = new Map();
  for (const [, d] of yearDays(state.year)) {
    for (const [m, bm] of Object.entries(d.byModel)) {
      totals.set(m, (totals.get(m) ?? 0) + bm.usage.output);
    }
  }
  const data = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));
  getChart("models").setOption({
    color: DARK.series,
    tooltip: { valueFormatter: (v) => fmt(v) },
    legend: { bottom: 0, textStyle: { color: DARK.muted } },
    series: [{
      type: "pie",
      radius: ["45%", "72%"],
      center: ["50%", "44%"],
      itemStyle: { borderColor: "#161b22", borderWidth: 2 },
      label: { color: DARK.text, formatter: (p) => `${p.name}\n${fmt(p.value)}` },
      data,
    }],
  }, true);
}

function renderDayDetail() {
  const t = T();
  const day = state.day;
  const d = DATA.days[day];
  $("#day-title").textContent = t.dayTitle(day);

  if (!d) {
    $("#day-summary").innerHTML = "";
    $("#sessions-title").textContent = t.sessionsTitle(0);
    $("#day-sessions").innerHTML = `<div class="empty">${t.noActivity}</div>`;
    loadDayReport(day);
    return;
  }

  $("#day-summary").innerHTML = t.daySummary(d);
  loadDayReport(day);

  const sessions = DATA.sessions
    .filter((s) => s.days.includes(day))
    .sort((a, b) => b.start.localeCompare(a.start));

  $("#sessions-title").textContent = t.sessionsTitle(sessions.length);

  if (sessions.length === 0) {
    $("#day-sessions").innerHTML = `<div class="empty">${t.noSessions}</div>`;
    return;
  }

  $("#day-sessions").innerHTML = sessions.map((s) => `
    <div class="session-card">
      <div class="session-head">
        <span class="session-time">${timeRange(s.start, s.end)}</span>
        <span class="project-badge">${esc(s.project)}</span>
        <span class="session-stats">${esc(s.models.join(", "))}</span>
      </div>
      <div class="session-title">${esc(s.title ?? t.untitled)}</div>
      <div class="session-stats">${t.sessionStats(s)}</div>
    </div>
  `).join("");
}

function renderAll() {
  applyStaticText();
  renderChips();
  renderHeatmap();
  renderTrend();
  renderHours();
  renderProjects();
  renderModels();
  renderDayDetail();
}

/* ---------- 初始化 ---------- */

async function main() {
  state.lang = detectLang();

  const res = await fetch("/api/stats");
  DATA = await res.json();

  const years = [...new Set(Object.keys(DATA.days).map((d) => d.slice(0, 4)))].sort();
  const currentYear = String(new Date().getFullYear());
  state.year = years.includes(currentYear) ? currentYear : (years[years.length - 1] ?? currentYear);

  const today = localToday();
  state.day = DATA.days[today] ? today : (DATA.rangeEnd ?? today);

  const yearSel = $("#year-select");
  yearSel.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join("");
  yearSel.value = state.year;
  yearSel.addEventListener("change", () => {
    state.year = yearSel.value;
    renderAll();
  });

  $("#metric-select").addEventListener("change", (e) => {
    state.metric = e.target.value;
    renderHeatmap();
  });

  $("#btn-llm").addEventListener("click", () => {
    if (!report.day) return;
    loadDayReport(report.day, { llm: true, force: report.mode === "llm" });
  });

  const langSel = $("#lang-select");
  langSel.value = state.lang;
  langSel.addEventListener("change", () => {
    state.lang = langSel.value;
    localStorage.setItem("journal-lang", state.lang);
    renderAll();
  });

  renderAll();

  getChart("heatmap").on("click", (p) => {
    if (p.data && p.data[0]) {
      state.day = p.data[0];
      renderDayDetail();
      $("#day-title").scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });

  window.addEventListener("resize", () => {
    Object.values(charts).forEach((c) => c.resize());
  });
}

main().catch((e) => {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div class="panel" style="color:#f85149">Failed to load: ${esc(e.message)}</div>`
  );
});
