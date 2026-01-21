function applyHighlights() {


    chrome.storage.local.get(["highlightedLinks", "active"], (data) => {
      if(!data.active) return;
      
      const highlightedLinks = data.highlightedLinks || {};
      for (const linkUrl in highlightedLinks) {
        document.querySelectorAll(`a[href^="${linkUrl}"]`).forEach(link => {
          console.log("link", linkUrl);
          link.style.backgroundColor = highlightedLinks[linkUrl];
        });
      }
    });
  }
  
  document.addEventListener("DOMContentLoaded", applyHighlights);
  window.addEventListener("load", applyHighlights);

// Extract best-effort metadata for a given linkUrl on the current page.
// This focuses on Google Scholar's common DOM structure, but degrades gracefully.
function extractMetadataForLink(linkUrl) {
  const anchors = Array.from(document.querySelectorAll('a'))
    .filter(a => a.href && a.href.startsWith(linkUrl));
  const a = anchors[0];
  if (!a) {
    return { title: linkUrl, authorsRaw: "", year: null };
  }

  // Try Scholar result container
  const container = a.closest('.gs_r') || a.closest('.gs_ri') || a.closest('div');
  let title = "";
  let authorsRaw = "";
  let year = null;

  // Scholar title is often within .gs_rt
  const tEl = container?.querySelector?.('.gs_rt') || a;
  title = (tEl?.innerText || a.textContent || linkUrl).trim();

  const aEl = container?.querySelector?.('.gs_a');
  if (aEl) authorsRaw = (aEl.innerText || "").trim();

  // crude year parse: first 4-digit year
  const m = (authorsRaw || container?.innerText || "").match(/\b(19\d{2}|20\d{2})\b/);
  if (m) year = Number(m[1]);

  return { title, authorsRaw, year };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'SVAT_EXTRACT_METADATA' && msg.linkUrl) {
    try {
      const meta = extractMetadataForLink(msg.linkUrl);
      sendResponse({ ok: true, meta });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
    return true;
  }
});
  