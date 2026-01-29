// Storage helpers for the Snowballing Visual Analytics Tool (SVAT)
// Works in extension pages (popup/dashboard/options).

import { storage } from './infrastructure/storage.mjs';

const SVAT_KEYS = {
  project: "svat_project",
  papers: "svat_papers",
  iterations: "svat_iterations",
  citations: "svat_citations",
  criteria: "svat_criteria",
};

function svatNowIso() {
  return new Date().toISOString();
}

function svatHashId(input) {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return "p_" + h.toString(16).padStart(8, "0");
}

function svatInferFromCategory(category) {
  const c = (category || "").toLowerCase();
  const origin = c.includes("seed") || c.includes("semente") ? "seed"
    : c.includes("back") || c.includes("refer") ? "backward"
    : c.includes("forw") || c.includes("cita") ? "forward"
    : "unknown";

  const status = c.includes("incl") ? "included"
    : c.includes("excl") ? "excluded"
    : c.includes("duplic") ? "duplicate"
    : "pending";

  return { origin, status };
}

async function svatGetAll() {
  const data = await storage.get(Object.values(SVAT_KEYS));
  const state = {
    project: data[SVAT_KEYS.project] || { id: "tcc-001", title: "Meu TCC", researcher: "", createdAt: svatNowIso(), currentIterationId: "I1" },
    papers: Array.isArray(data[SVAT_KEYS.papers]) ? data[SVAT_KEYS.papers] : [],
    iterations: data[SVAT_KEYS.iterations] || [{ id: "I1", type: "seed", mode: "seed", createdAt: svatNowIso() }],
    citations: data[SVAT_KEYS.citations] || [],
    criteria: data[SVAT_KEYS.criteria] || {},
  };

  // Normalize papers (audit trail support)
  for (const p of state.papers) {
    if (!p || typeof p !== "object") continue;
    if (!Array.isArray(p.history)) p.history = [];
    if (!p.createdAt) p.createdAt = svatNowIso();
    if (!p.updatedAt) p.updatedAt = p.createdAt;
  }
  return state;
}

async function svatSetAll(state) {
  const payload = {};
  payload[SVAT_KEYS.project] = state.project;
  payload[SVAT_KEYS.papers] = state.papers;
  payload[SVAT_KEYS.iterations] = state.iterations;
  payload[SVAT_KEYS.citations] = state.citations;
  payload[SVAT_KEYS.criteria] = state.criteria;
  await storage.set(payload);
}

async function svatUpsertPaper(paper) {
  const { papers } = await svatGetAll();
  const idx = papers.findIndex(p => p.id === paper.id);
  if (idx >= 0) papers[idx] = { ...papers[idx], ...paper, updatedAt: svatNowIso() };
  else papers.push({ ...paper, createdAt: svatNowIso(), updatedAt: svatNowIso() });
  await storage.set({ [SVAT_KEYS.papers]: papers });
  return papers;
}

function svatDownload(filename, content, mime = "application/json") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: true }, () => {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  });
}

function svatToCsv(rows) {
  const escape = (v) => {
    const s = (v ?? "").toString();
    if (/[\n\r,\"]/g.test(s)) return '"' + s.replace(/\"/g, '""') + '"';
    return s;
  };
  const headers = Object.keys(rows[0] || {});
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map(h => escape(r[h])).join(","));
  return lines.join("\n");
}

function svatToBibtex(papers) {
  const bibKey = (p) => {
    const a = (p.authors?.[0] || p.authorsRaw || "ref").toString().split(/\s+/)[0].replace(/[^a-zA-Z0-9]/g, "");
    const y = p.year || "nd";
    return `${a}${y}_${(p.id || "x").slice(-4)}`;
  };
  const esc = (s) => (s || "").toString().replace(/[{}]/g, "");
  return papers.map(p => {
    const key = bibKey(p);
    const title = esc(p.title || "");
    const year = p.year || "";
    const url = esc(p.url || "");
    const author = Array.isArray(p.authors) && p.authors.length ? p.authors.join(" and ") : esc(p.authorsRaw || "");
    return `@misc{${key},\n  title={${title}},\n  author={${author}},\n  year={${year}},\n  howpublished={\\url{${url}}}\n}`;
  }).join("\n\n");
}

// Backward compatibility: migrate old storage to SVAT if needed.
async function svatMigrateIfNeeded() {
  const data = await storage.get([SVAT_KEYS.papers, "highlightedLinks", "categories"]);
  if (Array.isArray(data[SVAT_KEYS.papers]) && data[SVAT_KEYS.papers].length) return;

  const hl = data.highlightedLinks || {};
  const categories = data.categories || {};
  const urls = Object.keys(hl);
  if (!urls.length) return;

  const state = await svatGetAll();
  for (const url of urls) {
    const id = svatHashId(url);
    // We cannot know category from old model (only color), so store unknown.
    state.papers.push({
      id,
      url,
      title: url,
      year: null,
      authors: [],
      authorsRaw: "",
      origin: "unknown",
      status: "pending",
      iterationId: state.project.currentIterationId || "I1",
      tags: [],
      visited: true,
      legacyColor: hl[url],
      createdAt: svatNowIso(),
      updatedAt: svatNowIso(),
      history: [{ ts: svatNowIso(), action: "migrate", details: { legacyColor: hl[url] } }],
    });
  }
  await svatSetAll(state);
}

window.SVAT_KEYS = SVAT_KEYS;
window.svatNowIso = svatNowIso;
window.svatHashId = svatHashId;
window.svatInferFromCategory = svatInferFromCategory;
window.svatGetAll = svatGetAll;
window.svatSetAll = svatSetAll;
window.svatUpsertPaper = svatUpsertPaper;
window.svatDownload = svatDownload;
window.svatToCsv = svatToCsv;
window.svatToBibtex = svatToBibtex;
window.svatMigrateIfNeeded = svatMigrateIfNeeded;
