function applyHighlights() {
    chrome.storage.local.get(["highlightedLinks"], (data) => {
      const highlightedLinks = data.highlightedLinks || {};
      for (const linkUrl in highlightedLinks) {
        document.querySelectorAll(`a[href^='${linkUrl}']`).forEach(link => {
          console.log("link", linkUrl);
          link.style.backgroundColor = highlightedLinks[linkUrl];
        });
      }
    });
  }
  
  document.addEventListener("DOMContentLoaded", applyHighlights);
  window.addEventListener("load", applyHighlights);
  