#!/usr/bin/env node
// Star history 生成器（dsh-web-ui 自托管 star 图表）。
//
// 背景：GitHub 自 2026-06-30 起限制 GET /repos/{owner}/{repo}/stargazers 接口，
// 仅仓库管理员与协作者可读，star-history.com 的公共图表因此不可用。
// 本脚本改为仓库自托管：bootstrap 一次性拉全量历史，snapshot 每日追加
// stargazers_count（公开字段）快照，重绘 star-history.svg 供 README 引用。
//
// 用法：
//   node star-history.mjs bootstrap --out <dir>   # 拉全量 stargazers，生成初始数据与图
//   node star-history.mjs snapshot  --out <dir>   # 追加当天快照并重绘；无变化输出 "unchanged"
//
// 认证：优先 GITHUB_TOKEN / GH_TOKEN 环境变量；bootstrap 必须为仓库
// owner/collaborator 的 token，snapshot 仅需公开接口（有 token 更稳）。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const REPO = process.env.GITHUB_REPOSITORY || "zhu1090093659/dsh-web-ui";
const API = "https://api.github.com";
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

const W = 800;
const H = 330;
const PAD = { left: 74, right: 26, top: 44, bottom: 48 };

function die(msg) {
  console.error("error: " + msg);
  process.exit(1);
}

function authHeaders(extra = {}) {
  const h = { ...extra, "User-Agent": "dsh-web-ui-star-history" };
  if (token) h.Authorization = "Bearer " + token;
  return h;
}

async function apiGet(path, accept) {
  const headers = authHeaders();
  if (accept) headers.Accept = accept;
  const res = await fetch(API + path, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error("GET " + path + ": HTTP " + res.status + " " + body.slice(0, 300));
  }
  return res;
}

// ---------- 数据 ----------

function utcDateStr(iso) {
  return iso.slice(0, 10);
}

async function fetchAllStargazers() {
  const items = [];
  let page = 1;
  for (;;) {
    const res = await apiGet(
      "/repos/" + REPO + "/stargazers?per_page=100&page=" + page,
      "application/vnd.github.star+json"
    );
    const batch = await res.json();
    if (!Array.isArray(batch)) die("stargazers 返回异常: " + JSON.stringify(batch).slice(0, 200));
    items.push(...batch);
    const link = res.headers.get("link") || "";
    if (!/rel="next"/.test(link)) break;
    page += 1;
    if (page > 500) die("分页超过 500 页，疑似死循环");
  }
  return items;
}

// bootstrap: 全量 stargazers -> points（按 star 时间升序，逐条累计）
async function bootstrap(outDir) {
  if (!token) die("bootstrap 需要 GITHUB_TOKEN（仓库 owner/collaborator）");
  const items = await fetchAllStargazers();
  items.sort((a, b) => (a.starred_at < b.starred_at ? -1 : 1));
  let n = 0;
  const points = items.map((it) => {
    n += 1;
    return { at: it.starred_at, stars: n };
  });
  if (points.length === 0) die("未取到任何 stargazer 数据");
  await writeData(outDir, points, "bootstrap");
  console.log("bootstrap: " + points.length + " points, 最新 " + points[points.length - 1].stars + " stars");
}

// snapshot: 追加当天 stargazers_count；同天重复运行覆盖当天记录
async function snapshot(outDir) {
  const histPath = join(outDir, "history.json");
  let hist;
  try {
    hist = JSON.parse(await readFile(histPath, "utf8"));
  } catch {
    die("缺少 " + histPath + "，请先运行 bootstrap");
  }
  const points = hist.points;
  const res = await apiGet("/repos/" + REPO);
  const count = (await res.json()).stargazers_count;
  const today = utcDateStr(new Date().toISOString());
  const last = points[points.length - 1];
  let changed = false;
  if (last && utcDateStr(last.at) === today) {
    if (last.stars !== count) {
      last.stars = count;
      changed = true;
    }
  } else if (!last || last.stars !== count) {
    points.push({ at: today + "T23:59:59Z", stars: count });
    changed = true;
  }
  if (!changed) {
    console.log("unchanged");
    return;
  }
  await writeData(outDir, points, "snapshot");
  console.log("snapshot: " + points.length + " points, " + count + " stars");
}

async function writeData(outDir, points, mode) {
  await mkdir(outDir, { recursive: true });
  const updated = utcDateStr(new Date().toISOString());
  const hist = { repository: REPO, updated, points };
  await writeFile(join(outDir, "history.json"), JSON.stringify(hist, null, 2) + "\n");
  await writeFile(join(outDir, "star-history.svg"), renderSvg(points, updated));
  console.log("wrote " + mode + " -> " + outDir + "/{history.json,star-history.svg}");
}

// ---------- SVG 渲染 ----------

function niceStep(raw) {
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step;
  if (norm >= 5) step = 5;
  else if (norm >= 2) step = 2;
  else step = 1;
  return step * mag;
}

function fmtAxis(iso, mode) {
  const d = new Date(iso);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  if (mode === "ym") return d.getUTCFullYear() + "-" + mm;
  if (mode === "md") return mm + "-" + dd;
  return mm + "-" + dd + " " + hh + ":" + mi;
}

function renderSvg(points, updated) {
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x0 = points[0].at;
  const x1 = points[points.length - 1].at;
  const t0 = new Date(x0).getTime();
  const t1 = new Date(x1).getTime();
  const spanMs = t1 - t0;
  const maxStars = points[points.length - 1].stars;
  const step = niceStep(Math.max(maxStars, 1) / 4);
  const yMax = Math.ceil(Math.max(maxStars, step) / step) * step;

  const px = (iso) => {
    const t = new Date(iso).getTime();
    if (spanMs === 0) return PAD.left + plotW / 2;
    return PAD.left + ((t - t0) / spanMs) * plotW;
  };
  const py = (v) => PAD.top + plotH - (v / yMax) * plotH;

  const labelMode = spanMs > 300 * 86400000 ? "ym" : spanMs > 3 * 86400000 ? "md" : "mdhm";

  let grid = "";
  for (let v = 0; v <= yMax; v += step) {
    const y = py(v);
    grid +=
      '<line x1="' + PAD.left + '" y1="' + y.toFixed(1) + '" x2="' + (W - PAD.right) + '" y2="' + y.toFixed(1) +
      '" stroke="#eaeef2" stroke-width="1"/>' +
      '<text x="' + (PAD.left - 10) + '" y="' + (y + 4).toFixed(1) + '" font-size="12" fill="#57606a" text-anchor="end">' +
      v + "</text>";
  }

  const xTicks = 8;
  const xLabels = [];
  for (let i = 0; i < xTicks; i += 1) {
    const frac = spanMs === 0 ? 0 : i / (xTicks - 1);
    const t = t0 + frac * spanMs;
    const iso = new Date(t).toISOString();
    xLabels.push({ x: PAD.left + frac * plotW, label: fmtAxis(iso, labelMode) });
  }
  let xAxis = "";
  for (const l of xLabels) {
    xAxis +=
      '<text x="' + l.x.toFixed(1) + '" y="' + (H - PAD.bottom + 22) + '" font-size="11" fill="#57606a" text-anchor="middle">' +
      l.label + "</text>";
  }

  const line = points.map((p) => px(p.at).toFixed(1) + "," + py(p.stars).toFixed(1)).join(" ");
  const area =
    PAD.left + "," + py(0).toFixed(1) + " " + line + " " + (W - PAD.right) + "," + py(0).toFixed(1);

  let dots = "";
  if (points.length <= 400) {
    for (const p of points) {
      dots += '<circle cx="' + px(p.at).toFixed(1) + '" cy="' + py(p.stars).toFixed(1) + '" r="2" fill="#1f6feb"/>';
    }
  }
  const lastP = points[points.length - 1];
  dots +=
    '<circle cx="' + px(lastP.at).toFixed(1) + '" cy="' + py(lastP.stars).toFixed(1) +
    '" r="4" fill="#0969da" stroke="#ffffff" stroke-width="1.5"/>';

  const title = "Star History · " + REPO;
  const footer = "Updated: " + updated + " · " + maxStars + " stars";

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H +
    '" role="img" aria-label="' + title + '">' +
    '<rect width="' + W + '" height="' + H + '" fill="#ffffff"/>' +
    '<text x="' + PAD.left + '" y="28" font-size="17" font-weight="600" fill="#24292f">' + title + "</text>" +
    '<text x="' + (W - PAD.right) + '" y="28" font-size="12" fill="#57606a" text-anchor="end">' + footer + "</text>" +
    grid +
    '<polygon points="' + area + '" fill="rgba(31,111,235,0.12)"/>' +
    '<polyline points="' + line + '" fill="none" stroke="#1f6feb" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
    dots +
    '<line x1="' + PAD.left + '" y1="' + py(0).toFixed(1) + '" x2="' + (W - PAD.right) + '" y2="' + py(0).toFixed(1) +
    '" stroke="#d0d7de" stroke-width="1"/>' +
    xAxis +
    "</svg>"
  );
}

// ---------- CLI ----------

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const outIdx = args.indexOf("--out");
  const outDir = outIdx >= 0 ? args[outIdx + 1] : ".";
  if (!outDir) die("--out <dir> 必填");
  if (cmd === "bootstrap") await bootstrap(outDir);
  else if (cmd === "snapshot") await snapshot(outDir);
  else die("用法: node star-history.mjs <bootstrap|snapshot> --out <dir>");
}

main().catch((e) => {
  console.error("error: " + (e && e.message ? e.message : e));
  process.exit(1);
});
