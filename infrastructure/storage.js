class StorageService {
  constructor() {
    
    // Proteção simples caso rode fora do ambiente da extensão (testes unitários)
    this.driver = (typeof chrome !== "undefined" && chrome.storage) 
      ? chrome.storage.local 
      : null;
  }
  /**
   * Método genérico para buscar chaves
   * @param {string|string[]} keys 
   */
  async get(keys) {
    if (!this.driver) return {};
    return new Promise((resolve) => {
      this.driver.get(keys, (result) => resolve(result));
    });
  }

  /**
   * Método genérico para salvar
   * @param {object} items - Objeto chave/valor { papers: [...] }
   */
  async set(items) {
    if (!this.driver) return;
    return new Promise((resolve) => {
      this.driver.set(items, () => resolve());
    });
  }

}
// Criamos a instância AQUI. Quem importar, recebe essa constante já instanciada.
export const storage = new StorageService();
// Helper to listen to chrome.storage.onChanged; returns an unsubscribe function
storage.addOnChangedListener = function (callback) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    const listener = (changes, areaName) => callback(changes, areaName);
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }
  return () => {};
};