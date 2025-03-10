document.addEventListener("DOMContentLoaded", () => {
    const categoryNameInput = document.getElementById("categoryName");
    const categoryColorInput = document.getElementById("categoryColor");
    const addCategoryButton = document.getElementById("addCategory");
    const categoryList = document.getElementById("categoryList");
    const highlightedList = document.getElementById("highlightedList");
    const removeLinks = document.getElementById("removeLinks");
    const downloadStorage = document.getElementById("downloadStorage");
    const uploadStorage = document.getElementById("uploadStorage");
    
  
    function loadCategories() {
      chrome.storage.local.get("categories", (data) => {
        categoryList.innerHTML = "";
        const categories = data.categories || {};
        for (const category in categories) {
          const li = document.createElement("li");
          li.textContent = `${category} - ${categories[category]}`;
          li.style.backgroundColor = categories[category];
          categoryList.appendChild(li);
        }
        chrome.runtime.sendMessage({ action: "updateContextMenu" });
      });
    }
    function loadHighlightedLinks(){
        chrome.storage.local.get(["categories", "highlightedLinks"], (data) => {
            highlightedList.innerHTML = "";
            const links = data.highlightedLinks || {};
            console.log(data)
            for (const link in links) {
                const li = document.createElement("li");
                li.textContent = `${link} - ${links[link]}`;
                li.style.backgroundColor = links[link];
                highlightedList.appendChild(li);
            }
            // chrome.runtime.sendMessage({ action: "updateContextMenu" });
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
        chrome.storage.local.get("highlightedLinks", (data) => {
          const highlightedLinks = {};
          chrome.storage.local.set({ highlightedLinks });
        });
      });
  

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



    loadCategories();
    loadHighlightedLinks();

  });