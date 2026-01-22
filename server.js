const WebSocket = require("ws");

const PORT = 8080;
const wss = new WebSocket.Server({ port: PORT });

console.log(`✅ WebSocket rodando em ws://localhost:${PORT}`);

wss.on("connection", (ws) => {
  console.log("🔌 Cliente conectou!");

  // mensagem inicial
  ws.send("Olá! Conexão WebSocket OK ✅");

  // recebe mensagens do client
  ws.on("message", (msg) => {
    const text = msg.toString();
    console.log("📩 Recebido:", text);

    if (text === "ping") {
      ws.send("pong ✅");
    } else {
      ws.send("eco: " + text);
    }
  });

  ws.on("close", () => {
    console.log("❌ Cliente desconectou.");
  });
});
