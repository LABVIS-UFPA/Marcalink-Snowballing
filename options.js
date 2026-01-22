document.addEventListener("DOMContentLoaded", () => {
    const categoryNameInput = document.getElementById("categoryName");
    const categoryColorInput = document.getElementById("categoryColor");
    const addCategoryButton = document.getElementById("addCategory");
    const seedDefaultCategoriesButton = document.getElementById("seedDefaultCategories");
    const categoryList = document.getElementById("categoryList");
    const highlightedList = document.getElementById("highlightedList");
    const highlightSearch = document.getElementById("highlightSearch");
    const removeLinks = document.getElementById("removeLinks");
    const downloadStorage = document.getElementById("downloadStorage");
    const uploadStorage = document.getElementById("uploadStorage");
    const checkOnOff = document.getElementById("checkOnOff");
    
  
    function loadOnOff(){
      chrome.storage.local.get("active", (data) => {
        checkOnOff.checked = data.active;
      });
    }
    function loadCategories() {
      chrome.storage.local.get("categories", (data) => {
        categoryList.innerHTML = "";
        const categories = data.categories || {};
        const names = Object.keys(categories).sort((a,b) => a.localeCompare(b));

        function removeCategory(name) {
          chrome.storage.local.get("categories", (d) => {
            const cats = d.categories || {};
            if (!cats[name]) return;
            delete cats[name];
            chrome.storage.local.set({ categories: cats }, () => {
              chrome.runtime.sendMessage({ action: "updateContextMenu" });
              loadCategories();
            });
          });
        }

        for (const category of names) {
          const color = categories[category];

          const li = document.createElement("li");
          li.style.backgroundColor = color;
          li.style.display = "flex";
          li.style.alignItems = "center";
          li.style.gap = "8px";
          li.style.padding = "6px";

          const label = document.createElement("span");
          label.textContent = category;
          label.style.fontWeight = "600";
          label.style.flex = "1";
          label.style.color = getLuminanceFromHex(color) < 0.5 ? "#fff" : "#000";

          const meta = document.createElement("span");
          meta.textContent = color;
          meta.style.fontFamily = "monospace";
          meta.style.fontSize = "12px";
          meta.style.color = getLuminanceFromHex(color) < 0.5 ? "#fff" : "#000";


          const btn = document.createElement("button");
          btn.textContent = "Excluir";
          btn.addEventListener("click", () => {
            if (!confirm(`Excluir a categoria "${category}"?`)) return;
            removeCategory(category);
          });
          btn.style.color = getLuminanceFromHex(color) < 0.5 ? "#fff" : "#000";
          if(getLuminanceFromHex(color) >= 0.5) btn.classList.add("dark");

          li.appendChild(label);
          li.appendChild(meta);
          li.appendChild(btn);

          categoryList.appendChild(li);
        }

        chrome.runtime.sendMessage({ action: "updateContextMenu" });
      });
    }
    function normalizeUrl(url) {
      return (url || "").replace(/[\?\&]casa\_token=\S+/i, "");
    }

    function deleteMarkedLink(urlToDelete, done) {
      const target = normalizeUrl(urlToDelete);
      chrome.storage.local.get(["highlightedLinks", "svat_papers"], (data) => {
        const highlightedLinks = data.highlightedLinks || {};
        // Remove chaves que batem com a URL (com e sem casa_token)
        for (const k of Object.keys(highlightedLinks)) {
          const nk = normalizeUrl(k);
          if (k === urlToDelete || nk === target || nk.startsWith(target) || target.startsWith(nk)) {
            delete highlightedLinks[k];
          }
        }

        // Remover também do SVAT (para não ficar lixo no dashboard)
        const papers = Array.isArray(data.svat_papers) ? data.svat_papers : [];
        const filteredPapers = papers.filter(p => normalizeUrl(p?.url) !== target);

        chrome.storage.local.set({ highlightedLinks, svat_papers: filteredPapers }, () => {
          done && done();
        });
      });
    }

    function loadHighlightedLinks(){
        chrome.storage.local.get(["highlightedLinks", "svat_papers"], (data) => {
            highlightedList.innerHTML = "";
            const links = data.highlightedLinks || {};

            // Mapa URL normalizada -> título (para mostrar algo mais amigável que só a URL)
            const papers = Array.isArray(data.svat_papers) ? data.svat_papers : [];
            const titleByUrl = new Map();
            for (const p of papers) {
              const nu = normalizeUrl(p?.url);
              if (!nu) continue;
              const t = (p?.title || "").trim();
              if (t) titleByUrl.set(nu, t);
            }

            const q = (highlightSearch?.value || "").trim().toLowerCase();

            const items = Object.keys(links)
              .map(url => {
                const nurl = normalizeUrl(url);
                const title = titleByUrl.get(nurl) || "";
                return { url, nurl, title, color: links[url] };
              })
              .filter(it => {
                if (!q) return true;
                return (it.url || "").toLowerCase().includes(q) || (it.title || "").toLowerCase().includes(q);
              });

            // Mostra botão "Resetar" se houver algo
            removeLinks.style.display = items.length ? "inline-block" : "none";

            for (const it of items) {
                const li = document.createElement("li");
                li.style.backgroundColor = it.color;
                li.style.display = "flex";
                li.style.alignItems = "center";
                li.style.gap = "8px";
                li.style.padding = "6px";

                const linkWrap = document.createElement("div");
                linkWrap.style.flex = "1";
                linkWrap.style.display = "flex";
                linkWrap.style.flexDirection = "column";
                linkWrap.style.gap = "2px";

                const a = document.createElement("a");
                a.href = it.url;
                a.textContent = it.title ? it.title : it.url;
                a.target = "_blank";
                a.rel = "noreferrer";
                a.style.fontWeight = it.title ? "600" : "400";
                a.style.overflowWrap = "anywhere";
                a.style.color = getLuminanceFromHex(it.color) < 0.5 ? "#fff" : "#000";

                const urlSmall = document.createElement("div");
                if (it.title) {
                  urlSmall.textContent = it.url;
                  urlSmall.style.fontSize = "12px";
                  urlSmall.style.opacity = "0.85";
                  urlSmall.style.overflowWrap = "anywhere";
                }

                linkWrap.appendChild(a);
                if (it.title) linkWrap.appendChild(urlSmall);

                const meta = document.createElement("span");
                meta.textContent = it.color;
                meta.style.fontFamily = "monospace";
                meta.style.fontSize = "12px";
                meta.style.color = getLuminanceFromHex(it.color) < 0.5 ? "#fff" : "#000";

                const btn = document.createElement("button");
                btn.textContent = "Excluir";
                btn.addEventListener("click", () => {
                  if (!confirm("Excluir este link marcado?")) return;
                  deleteMarkedLink(it.url, () => loadHighlightedLinks());
                });
                btn.style.color = getLuminanceFromHex(it.color) < 0.5 ? "#fff" : "#000";
                if(getLuminanceFromHex(it.color) >= 0.5) btn.classList.add("dark");

                li.appendChild(linkWrap);
                li.appendChild(meta);
                li.appendChild(btn);

                highlightedList.appendChild(li);
            }
        });
    }
  

    checkOnOff.addEventListener("change", () => {
      chrome.storage.local.set({active: checkOnOff.checked}, function () {
        console.log(checkOnOff.checked?"Ativo.":"Desativado.");
      });
    });
    
    if (seedDefaultCategoriesButton) {
      seedDefaultCategoriesButton.addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "seedDefaultCategories" }, () => {
          // Recarrega lista para o usuário ver as categorias padrão
          loadCategories();
          alert("Categorias padrão de Snowballing criadas/mescladas!");
        });
      });
    }

addCategoryButton.addEventListener("click", () => {
      const name = categoryNameInput.value.trim();
      const color = categoryColorInput.value;
      if (!name) return;
  
      chrome.storage.local.get("categories", (data) => {
        const categories = data.categories || {};
        categories[name] = color;
        chrome.storage.local.set({ categories }, () => {
          categoryNameInput.value = "";
          loadCategories();
        });
      });
    });
    removeLinks.addEventListener("click", () => {
        if (!confirm("Tem certeza que deseja remover TODOS os links marcados?")) return;
        chrome.storage.local.set({ highlightedLinks: {}, svat_papers: [] }, () => {
          loadHighlightedLinks();
        });
    });

    if (highlightSearch) {
      highlightSearch.addEventListener("input", () => loadHighlightedLinks());
    }
  

    downloadStorage.addEventListener("click", () => {
      chrome.storage.local.get(null, function (data) {
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "storage_backup.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
    });

    uploadStorage.addEventListener("change", function (event) {
        if (!confirm("Tem certeza de que deseja fazer upload deste arquivo? Isso pode sobrescrever os dados existentes.")) return;
        
        const file = event.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = function (event) {
              try {
                  const jsonData = JSON.parse(event.target.result);
                  chrome.storage.local.set(jsonData, function () {
                      alert("Dados carregados no storage com sucesso!");
                  });
              } catch (error) {
                  alert("Erro ao processar o JSON: " + error);
              }
          };
          reader.readAsText(file);
        }
    });


    loadOnOff();
    loadCategories();
    loadHighlightedLinks();

  });


  function getLuminanceFromHex(hex) {
    // Expand shorthand form (e.g. "#03F") to full form (e.g. "#0033FF")
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function(m, r, g, b) {
        return r + r + g + g + b + b;
    });

    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

    if (!result) return 0; // Return 0 if hex is invalid

    // Convert hex components to RGB decimals
    let r = parseInt(result[1], 16) / 255;
    let g = parseInt(result[2], 16) / 255;
    let b = parseInt(result[3], 16) / 255;

    // Apply the WCAG luminance formula for linear RGB
    r = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    g = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
    b = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    return luminance;
}