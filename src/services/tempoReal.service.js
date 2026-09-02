'use strict';

/**
 * Tempo real via Server-Sent Events (SSE).
 *
 * Cada aba aberta de um usuário logado mantém uma conexão em /notificacoes/stream.
 * Quando algo acontece (nova notificação, contagem mudou), "publicar" empurra o
 * evento para todas as abas daquele usuário na hora — sem polling.
 *
 * SSE funciona em HTTP puro (diferente do Web Push) e reconecta sozinho no
 * navegador. O app roda em UM processo (PM2 sem cluster), então o registro
 * em memória é suficiente.
 */
const clientes = new Map(); // idUsuario -> Set<res>

const HEARTBEAT_MS = 25000;

function inscrever(idUsuario, req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');

  if (!clientes.has(idUsuario)) clientes.set(idUsuario, new Set());
  clientes.get(idUsuario).add(res);

  const timer = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (e) { /* conexão já caiu */ }
  }, HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(timer);
    const set = clientes.get(idUsuario);
    if (set) {
      set.delete(res);
      if (!set.size) clientes.delete(idUsuario);
    }
  });
}

// Envia um evento nomeado (com JSON) para todas as abas do usuário.
function publicar(idUsuario, evento, dados) {
  const set = clientes.get(Number(idUsuario));
  if (!set || !set.size) return 0;
  const corpo = `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
  let n = 0;
  for (const res of set) {
    try { res.write(corpo); n++; } catch (e) { set.delete(res); }
  }
  return n;
}

function online(idUsuario) {
  const set = clientes.get(Number(idUsuario));
  return !!(set && set.size);
}

module.exports = { inscrever, publicar, online };
