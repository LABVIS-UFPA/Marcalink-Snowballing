// Aplica as marcações (highlight) do projeto ativo na página
function clearHighlights() {
  document.querySelectorAll('a[data-svat-hl="1"]').forEach((a) => {
    a.style.backgroundColor = "";
    a.removeAttribute("data-svat-hl");
  });
}

function applyHighlights() {
  chrome.storage.local.get(["svat_active_project_id", "active"], (meta) => {
    if (!meta.active) {
      clearHighlights();
      return;
    }

    const pid = meta.svat_active_project_id || "tcc-001";
    const hlKey = `highlightedLinks__${pid}`;

    chrome.storage.local.get([hlKey], (data) => {
      clearHighlights();

      const highlightedLinks = data[hlKey] || {};
      for (const linkUrl in highlightedLinks) {
        document.querySelectorAll(`a[href^="${linkUrl}"]`).forEach((link) => {
          link.style.backgroundColor = highlightedLinks[linkUrl];
          link.setAttribute("data-svat-hl", "1");
        });
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", applyHighlights);
window.addEventListener("load", applyHighlights);

// Atualiza automaticamente quando o projeto ativo muda (ou quando as marcações mudam)
if (chrome?.storage?.onChanged) {
  let t = null;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;

    const keys = Object.keys(changes || {});
    const relevant =
      keys.includes("svat_active_project_id") ||
      keys.includes("active") ||
      keys.some((k) => k.startsWith("highlightedLinks__"));

    if (!relevant) return;

    if (t) clearTimeout(t);
    t = setTimeout(applyHighlights, 100);
  });
}

// Extract best-effort metadata for a given linkUrl on the current page.
function extractMetadataForLink(linkUrl) {
  const anchors = Array.from(document.querySelectorAll("a"))
    .filter((a) => a.href && a.href.startsWith(linkUrl));

  const a = anchors[0];
  if (!a) return { title: linkUrl, authorsRaw: "", year: null };

  const container = a.closest(".gs_r") || a.closest(".gs_ri") || a.closest("div");

  const titleEl = container?.querySelector?.(".gs_rt") || a;
  const title = (titleEl?.innerText || a.textContent || linkUrl).trim();

  const aEl = container?.querySelector?.(".gs_a");
  const authorsRaw = (aEl?.innerText || "").trim();

  const m = (authorsRaw || container?.innerText || "").match(/\b(19\d{2}|20\d{2})\b/);
  const year = m ? Number(m[1]) : null;

  return { title, authorsRaw, year };
}

// Responde ao background quando ele pede metadata do link clicado no menu
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "SVAT_EXTRACT_METADATA" && msg.linkUrl) {
    try {
      const meta = extractMetadataForLink(msg.linkUrl);
      sendResponse({ ok: true, meta });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
    return true;
  }
});
