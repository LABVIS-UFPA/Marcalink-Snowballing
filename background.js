function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "highlightLink",
      title: "Marcar link",
      contexts: ["link"]
    });

    chrome.storage.local.get(["categories"], (data) => {
      const categories = data.categories || {};
      for (const category in categories) {
        chrome.contextMenus.create({
          parentId: "highlightLink",
          id: `highlight_${category}`,
          title: category,
          contexts: ["link"]
        });
      }
    });

    chrome.contextMenus.create({
      id: "removeHighlight",
      title: "Remover marcação",
      contexts: ["link"]
    });
  });
}

chrome.runtime.onInstalled.addListener(createContextMenu);
chrome.runtime.onStartup.addListener(createContextMenu);

chrome.storage.onChanged.addListener((changes) => {
  if (changes.categories) {
    createContextMenu();
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId.startsWith("highlight_")) {
    const category = info.menuItemId.replace("highlight_", "");
    chrome.storage.local.get(["categories", "highlightedLinks"], (data) => {
      const color = data.categories[category] || "yellow";
      let highlightedLinks = data.highlightedLinks || {};
      info.linkUrl = info.linkUrl.replace(/[\?|\&]casa\_token=\S+/i, "");
      highlightedLinks[info.linkUrl] = color;
      chrome.storage.local.set({ highlightedLinks });

      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: highlightLink,
        args: [info.linkUrl, color]
      });
    });
  }

  if (info.menuItemId === "removeHighlight") {
    chrome.storage.local.get(["highlightedLinks"], (data) => {
      let highlightedLinks = data.highlightedLinks || {};
      delete highlightedLinks[info.linkUrl];
      info.linkUrl = info.linkUrl.replace(/[\?|\&]casa\_token=\S+/i, "");
      delete highlightedLinks[info.linkUrl];
      chrome.storage.local.set({ highlightedLinks });

      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: removeHighlight,
        args: [info.linkUrl]
      });
    });
  }
});

function highlightLink(linkUrl, color) {
  document.querySelectorAll(`a[href^='${linkUrl}']`).forEach(link => {
    link.style.backgroundColor = color;
  });
}

function removeHighlight(linkUrl) {
  document.querySelectorAll(`a[href^='${linkUrl}']`).forEach(link => {
    link.style.backgroundColor = "";
  });
}