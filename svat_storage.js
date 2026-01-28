// Storage helpers for the Snowballing Visual Analytics Tool (SVAT)
// Works in extension pages (popup/dashboard/options/background).

import { storage } from './infrastructure/storage.js';

/**
 * Legacy single-project keys (kept for migration/backward compatibility)
 */
const SVAT_LEGACY_KEYS = {
  project: "svat_project",
  papers: "svat_papers",
  iterations: "svat_iterations",
  citations: "svat_citations",
  criteria: "svat_criteria",
  categories: "categories",
  highlightedLinks: "highlightedLinks",
};

/**
 * Multi-project meta keys
 */
const SVAT_META_KEYS = {
  projects: "svat_projects", // array<{id,title,createdAt, researcher?}>
  activeProjectId: "svat_active_project_id",
};

/**
 * Per-project key builder: <base>__<projectId>
 */
function svatKey(base, projectId) {
  return `${base}__${projectId}`;
}

const SVAT_PROJECT_BASE = {
  project: "svat_project",
  papers: "svat_papers",
  iterations: "svat_iterations",
  citations: "svat_citations",
  criteria: "svat_criteria",
  categories: "categories",
  highlightedLinks: "highlightedLinks",
};

// Default categories (same spirit as background.js seeding)
// Only used when creating a new project or when the project has no categories yet.
const DEFAULT_SNOWBALLING_CATEGORIES = {
  "Seed": "#4CAF50",
  "Backward": "#2196F3",
  "Forward": "#9C27B0",
  "Included": "#2E7D32",
  "Excluded": "#D32F2F",
  "Duplicate": "#757575",
  "Pending": "#FF9800",
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

function svatMakeProjectId(title) {
  const base = (title || "projeto").toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
  const suffix = Math.random().toString(16).slice(2, 6);
  return `${base || "projeto"}-${suffix}`;
}

async function svatEnsureMultiProjectInitialized() {
  const meta = await storage.get([SVAT_META_KEYS.projects, SVAT_META_KEYS.activeProjectId, ...Object.values(SVAT_LEGACY_KEYS)]);
  const hasMulti = Array.isArray(meta[SVAT_META_KEYS.projects]) && meta[SVAT_META_KEYS.projects].length;
  const activeId = meta[SVAT_META_KEYS.activeProjectId];

  if (hasMulti && activeId) return;

  // Build a default project from legacy if exists, else create a new empty one.
  const legacyProject = meta[SVAT_LEGACY_KEYS.project] || { id: "tcc-001", title: "Meu TCC", researcher: "", createdAt: svatNowIso(), currentIterationId: "I1" };
  const pid = legacyProject.id || "tcc-001";

  const projects = hasMulti ? meta[SVAT_META_KEYS.projects] : [{ id: pid, title: legacyProject.title || pid, createdAt: legacyProject.createdAt || svatNowIso(), researcher: legacyProject.researcher || "" }];
  const payload = {};
  payload[SVAT_META_KEYS.projects] = projects;
  payload[SVAT_META_KEYS.activeProjectId] = activeId || pid;

  // Migrate legacy per-project data into suffixed keys only if not present.
  const targetKeys = {
    project: svatKey(SVAT_PROJECT_BASE.project, pid),
    papers: svatKey(SVAT_PROJECT_BASE.papers, pid),
    iterations: svatKey(SVAT_PROJECT_BASE.iterations, pid),
    citations: svatKey(SVAT_PROJECT_BASE.citations, pid),
    criteria: svatKey(SVAT_PROJECT_BASE.criteria, pid),
    categories: svatKey(SVAT_PROJECT_BASE.categories, pid),
    highlightedLinks: svatKey(SVAT_PROJECT_BASE.highlightedLinks, pid),
  };

  if (!meta[targetKeys.project]) payload[targetKeys.project] = legacyProject;
  if (!meta[targetKeys.papers]) payload[targetKeys.papers] = Array.isArray(meta[SVAT_LEGACY_KEYS.papers]) ? meta[SVAT_LEGACY_KEYS.papers] : [];
  if (!meta[targetKeys.iterations]) payload[targetKeys.iterations] = meta[SVAT_LEGACY_KEYS.iterations] || [{ id: legacyProject.currentIterationId || "I1", type: "seed", mode: "seed", createdAt: svatNowIso() }];
  if (!meta[targetKeys.citations]) payload[targetKeys.citations] = meta[SVAT_LEGACY_KEYS.citations] || [];
  if (!meta[targetKeys.criteria]) payload[targetKeys.criteria] = meta[SVAT_LEGACY_KEYS.criteria] || {};
  if (!meta[targetKeys.categories]) {
    const legacyCats = meta[SVAT_LEGACY_KEYS.categories] || {};
    payload[targetKeys.categories] = (legacyCats && Object.keys(legacyCats).length) ? legacyCats : { ...DEFAULT_SNOWBALLING_CATEGORIES };
  }
  if (!meta[targetKeys.highlightedLinks]) payload[targetKeys.highlightedLinks] = meta[SVAT_LEGACY_KEYS.highlightedLinks] || {};

  await storage.set(payload);
}

async function svatGetActiveProjectId() {
  await svatEnsureMultiProjectInitialized();
  const data = await storage.get([SVAT_META_KEYS.activeProjectId]);
  return data[SVAT_META_KEYS.activeProjectId];
}

async function svatSetActiveProjectId(projectId) {
  await storage.set({ [SVAT_META_KEYS.activeProjectId]: projectId });
}

async function svatListProjects() {
  await svatEnsureMultiProjectInitialized();
  const data = await storage.get([SVAT_META_KEYS.projects, SVAT_META_KEYS.activeProjectId]);
  return {
    projects: Array.isArray(data[SVAT_META_KEYS.projects]) ? data[SVAT_META_KEYS.projects] : [],
    activeProjectId: data[SVAT_META_KEYS.activeProjectId],
  };
}

async function svatCreateProject({ title }) {
  await svatEnsureMultiProjectInitialized();
  const { projects } = await svatListProjects();
  const id = svatMakeProjectId(title);
  const projMeta = { id, title: title || id, createdAt: svatNowIso(), researcher: "" };
  const next = [...projects, projMeta];
  const payload = {};
  payload[SVAT_META_KEYS.projects] = next;
  payload[SVAT_META_KEYS.activeProjectId] = id;

  // Initialize empty state for the new project
  payload[svatKey(SVAT_PROJECT_BASE.project, id)] = { id, title: projMeta.title, researcher: "", createdAt: projMeta.createdAt, currentIterationId: "I1" };
  payload[svatKey(SVAT_PROJECT_BASE.papers, id)] = [];
  payload[svatKey(SVAT_PROJECT_BASE.iterations, id)] = [{ id: "I1", type: "seed", mode: "seed", createdAt: svatNowIso() }];
  payload[svatKey(SVAT_PROJECT_BASE.citations, id)] = [];
  payload[svatKey(SVAT_PROJECT_BASE.criteria, id)] = {};
  payload[svatKey(SVAT_PROJECT_BASE.categories, id)] = { ...DEFAULT_SNOWBALLING_CATEGORIES };
  payload[svatKey(SVAT_PROJECT_BASE.highlightedLinks, id)] = {};

  await storage.set(payload);
  return id;
}

async function svatDeleteProject(projectId) {
  const { projects, activeProjectId } = await svatListProjects();
  if (projects.length <= 1) throw new Error("Você precisa manter pelo menos 1 projeto.");
  const next = projects.filter(p => p.id !== projectId);
  const newActive = (activeProjectId === projectId) ? next[0].id : activeProjectId;

  await storage.set({
    [SVAT_META_KEYS.projects]: next,
    [SVAT_META_KEYS.activeProjectId]: newActive,
  });

  // Remove per-project keys
  await storage.remove([
    svatKey(SVAT_PROJECT_BASE.project, projectId),
    svatKey(SVAT_PROJECT_BASE.papers, projectId),
    svatKey(SVAT_PROJECT_BASE.iterations, projectId),
    svatKey(SVAT_PROJECT_BASE.citations, projectId),
    svatKey(SVAT_PROJECT_BASE.criteria, projectId),
    svatKey(SVAT_PROJECT_BASE.categories, projectId),
    svatKey(SVAT_PROJECT_BASE.highlightedLinks, projectId),
  ]);
}

async function svatRenameProject(projectId, newTitle) {
  const { projects } = await svatListProjects();
  const next = projects.map(p => p.id === projectId ? { ...p, title: newTitle || p.title } : p);
  await storage.set({ [SVAT_META_KEYS.projects]: next });

  // Keep project meta in per-project state in sync (title only)
  const pkey = svatKey(SVAT_PROJECT_BASE.project, projectId);
  const data = await storage.get([pkey]);
  const proj = data[pkey] || { id: projectId, createdAt: svatNowIso(), currentIterationId: "I1" };
  proj.title = newTitle || proj.title || projectId;
  await storage.set({ [pkey]: proj });
}

async function svatGetAll() {
  const pid = await svatGetActiveProjectId();
  const keys = [
    svatKey(SVAT_PROJECT_BASE.project, pid),
    svatKey(SVAT_PROJECT_BASE.papers, pid),
    svatKey(SVAT_PROJECT_BASE.iterations, pid),
    svatKey(SVAT_PROJECT_BASE.citations, pid),
    svatKey(SVAT_PROJECT_BASE.criteria, pid),
  ];

  const data = await storage.get(keys);
  const project = data[keys[0]] || { id: pid, title: pid, researcher: "", createdAt: svatNowIso(), currentIterationId: "I1" };
  const state = {
    project,
    papers: Array.isArray(data[keys[1]]) ? data[keys[1]] : [],
    iterations: data[keys[2]] || [{ id: project.currentIterationId || "I1", type: "seed", mode: "seed", createdAt: svatNowIso() }],
    citations: data[keys[3]] || [],
    criteria: data[keys[4]] || {},
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
  const pid = await svatGetActiveProjectId();
  const payload = {};
  payload[svatKey(SVAT_PROJECT_BASE.project, pid)] = state.project;
  payload[svatKey(SVAT_PROJECT_BASE.papers, pid)] = state.papers;
  payload[svatKey(SVAT_PROJECT_BASE.iterations, pid)] = state.iterations;
  payload[svatKey(SVAT_PROJECT_BASE.citations, pid)] = state.citations;
  payload[svatKey(SVAT_PROJECT_BASE.criteria, pid)] = state.criteria;
  await storage.set(payload);
}

async function svatUpsertPaper(paper) {
  const pid = await svatGetActiveProjectId();
  const papersKey = svatKey(SVAT_PROJECT_BASE.papers, pid);
  const data = await storage.get([papersKey]);
  const papers = Array.isArray(data[papersKey]) ? data[papersKey] : [];
  const idx = papers.findIndex(p => p.id === paper.id);
  if (idx >= 0) papers[idx] = { ...papers[idx], ...paper, updatedAt: svatNowIso() };
  else papers.push({ ...paper, createdAt: svatNowIso(), updatedAt: svatNowIso() });
  await storage.set({ [papersKey]: papers });
  return papers;
}

async function svatGetCategories() {
  const pid = await svatGetActiveProjectId();
  const key = svatKey(SVAT_PROJECT_BASE.categories, pid);
  const data = await storage.get([key]);
  return data[key] || {};
}

async function svatSetCategories(categories) {
  const pid = await svatGetActiveProjectId();
  const key = svatKey(SVAT_PROJECT_BASE.categories, pid);
  await storage.set({ [key]: categories || {} });
}

async function svatGetHighlightedLinks() {
  const pid = await svatGetActiveProjectId();
  const key = svatKey(SVAT_PROJECT_BASE.highlightedLinks, pid);
  const data = await storage.get([key]);
  return data[key] || {};
}

async function svatSetHighlightedLinks(links) {
  const pid = await svatGetActiveProjectId();
  const key = svatKey(SVAT_PROJECT_BASE.highlightedLinks, pid);
  await storage.set({ [key]: links || {} });
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

// Backward compatibility: migrate old storage highlights to papers if needed (only for active project).
async function svatMigrateIfNeeded() {
  await svatEnsureMultiProjectInitialized();
  const pid = await svatGetActiveProjectId();
  const papersKey = svatKey(SVAT_PROJECT_BASE.papers, pid);
  const hlKey = svatKey(SVAT_PROJECT_BASE.highlightedLinks, pid);

  const data = await storage.get([papersKey, hlKey]);
  if (Array.isArray(data[papersKey]) && data[papersKey].length) return;

  const hl = data[hlKey] || {};
  const urls = Object.keys(hl);
  if (!urls.length) return;

  const state = await svatGetAll();
  for (const url of urls) {
    const id = svatHashId(url);
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

/** Exports for module consumers */
export {
  SVAT_LEGACY_KEYS,
  SVAT_META_KEYS,
  SVAT_PROJECT_BASE,
  svatKey,
  svatNowIso,
  svatHashId,
  svatInferFromCategory,
  svatGetActiveProjectId,
  svatSetActiveProjectId,
  svatListProjects,
  svatCreateProject,
  svatDeleteProject,
  svatRenameProject,
  svatGetAll,
  svatSetAll,
  svatUpsertPaper,
  svatGetCategories,
  svatSetCategories,
  svatGetHighlightedLinks,
  svatSetHighlightedLinks,
  svatDownload,
  svatToCsv,
  svatToBibtex,
  svatMigrateIfNeeded,
};

// Also expose helpers in window for non-module scripts.
// IMPORTANT: service workers (background) do not have `window`, so guard it.
if (typeof window !== 'undefined') {
  window.SVAT_LEGACY_KEYS = SVAT_LEGACY_KEYS;
  window.SVAT_META_KEYS = SVAT_META_KEYS;
  window.SVAT_PROJECT_BASE = SVAT_PROJECT_BASE;
  window.svatKey = svatKey;
  window.svatNowIso = svatNowIso;
  window.svatHashId = svatHashId;
  window.svatInferFromCategory = svatInferFromCategory;
  window.svatGetActiveProjectId = svatGetActiveProjectId;
  window.svatSetActiveProjectId = svatSetActiveProjectId;
  window.svatListProjects = svatListProjects;
  window.svatCreateProject = svatCreateProject;
  window.svatDeleteProject = svatDeleteProject;
  window.svatRenameProject = svatRenameProject;
  window.svatGetAll = svatGetAll;
  window.svatSetAll = svatSetAll;
  window.svatUpsertPaper = svatUpsertPaper;
  window.svatGetCategories = svatGetCategories;
  window.svatSetCategories = svatSetCategories;
  window.svatGetHighlightedLinks = svatGetHighlightedLinks;
  window.svatSetHighlightedLinks = svatSetHighlightedLinks;
  window.svatDownload = svatDownload;
  window.svatToCsv = svatToCsv;
  window.svatToBibtex = svatToBibtex;
  window.svatMigrateIfNeeded = svatMigrateIfNeeded;
}
