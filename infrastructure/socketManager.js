// Socket manager: exporta uma instância compartilhada do WebsocketManager
class WebsocketManager {
  constructor() {
    this.socket = null;
    this._closedFinalized = false;
    this.tryAutoConnect();
    this.autoConnectionTime = 100;
  }

  buildWsUrl(url, port) {
    let u = (url || "").trim();
    let p = (port || "").toString().trim();
    if (!u) u = "ws://localhost";
    if (!p) p = "8080";
    if (!/^wss?:\/\//i.test(u)) u = "ws://" + u;
    u = u.replace(/\/+$/g, "");
    if (/:(\d+)$/.test(u)) return u;
    return `${u}:${p}`;
  }

  setStatus(status) {
    chrome.storage.local.set({ server_status: status });
  }

  appendLog(msg) {
    chrome.storage.local.get({ server_messages: [] }, (res) => {
      const msgs = Array.isArray(res.server_messages) ? res.server_messages : [];
      msgs.push({ time: Date.now(), data: msg });
      chrome.storage.local.set({ server_messages: msgs.slice(-500) });
    });
  }

  finalizeClose(logMsg = "🔌 Conexão encerrada", statusText = "Desconectado") {
    if (this._closedFinalized) return;
    this._closedFinalized = true;
    try { this.socket = null; } catch (e) { this.socket = null; }
    this.setStatus(statusText);
    this.appendLog(logMsg);
  }

  disconnect() {
    try { if (this.socket) this.socket.close(); } catch (e) {}
    this.finalizeClose("🔌 Desconectado", "Desconectado");
  }

  connect(url, port) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.appendLog("Já está conectado.");
      return;
    }

    const fullUrl = this.buildWsUrl(url, port);
    this.setStatus("Conectando...");
    this.appendLog("Conectando em " + fullUrl);
    this._closedFinalized = false;

    try {
      this.socket = new WebSocket(fullUrl);
    } catch (e) {
      this.setStatus("Erro");
      this.appendLog("Erro ao criar WebSocket: " + (e?.message || e));
      this.socket = null;
      this._closedFinalized = true;
      return;
    }

    this.socket.onopen = () => {
      this.setStatus("Conectado");
      this.appendLog("✅ Conectado");
      this.autoConnectionTime = 100;
    };

    this.socket.onmessage = (e) => {
      this.appendLog("MSG: " + e.data);
    };

    this.socket.onerror = () => {
      this.setStatus("Erro");
      this.appendLog("❌ Erro na conexão");
    };

    this.socket.onclose = () => {
      this.finalizeClose("🔌 Conexão encerrada", "Desconectado");
      setTimeout(() => this.tryAutoConnect(), this.autoConnectionTime);
      this.autoConnectionTime *= 2;
      if (this.autoConnectionTime > 60000) this.autoConnectionTime = 60000;
    };
  }

  send(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(data);
      this.appendLog("➡️ " + (typeof data === 'string' ? data : JSON.stringify(data)));
      return true;
    }
    return false;
  }

  tryAutoConnect() {
    chrome.storage.local.get(["server_url", "server_port"], (data) => {
      if (!data.server_url) {
        data.server_url = "ws://localhost";
        data.server_port = "8080";
        chrome.storage.local.set(data);
      }
      const u = data.server_url;
      const p = data.server_port;
      if (u) this.connect(u, p);
    });
  }
}

export const wsManager = new WebsocketManager();
