'use strict';

/**
 * Tempo real via Server-Sent Events (SSE).
 *
 * Cada aba aberta de um usuário logado mantém uma conexão em /notificacoes/stream.
 * Quando algo acontece (notificação, mensagem no Direct, alguém digitando, post
 * novo, presença), "publicar" empurra o evento para as abas daquele usuário na
 * hora — sem polling. "publicarTodos" avisa todo mundo que está conectado.
 *
 * SSE funciona em HTTP puro (diferente do Web Push) e reconecta sozinho no
 * navegador. O app roda em UM processo (PM2 sem cluster), então o registro
 * em memória é suficiente.
 */
const clientes = new Map(); // idUsuario -> Set<res>
const ultimaVez = new Map(); // idUsuario -> timestamp da última conexão fechada ("visto por último")

const HEARTBEAT_MS = 25000;

function inscrever(idUsuario, req, res) {
  idUsuario = Number(idUsuario);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');

  const primeiraAba = !clientes.has(idUsuario) || !clientes.get(idUsuario).size;
  if (!clientes.has(idUsuario)) clientes.set(idUsuario, new Set());
  clientes.get(idUsuario).add(res);
  // Entrou: quem está conectado fica sabendo (bolinha verde no Direct)
  if (primeiraAba) publicarTodos('presenca', { id_usuario: idUsuario, online: true }, idUsuario);

  const timer = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (e) { /* conexão já caiu */ }
  }, HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(timer);
    const set = clientes.get(idUsuario);
    if (set) {
      set.delete(res);
      if (!set.size) {
        clientes.delete(idUsuario);
        ultimaVez.set(idUsuario, Date.now());
        publicarTodos('presenca', { id_usuario: idUsuario, online: false }, idUsuario);
      }
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

// Envia para TODO MUNDO conectado (menos "exceto", se informado).
function publicarTodos(evento, dados, exceto = null) {
  let n = 0;
  for (const id of clientes.keys()) {
    if (exceto != null && id === Number(exceto)) continue;
    n += publicar(id, evento, dados);
  }
  return n;
}

function online(idUsuario) {
  const set = clientes.get(Number(idUsuario));
  return !!(set && set.size);
}

// Ids de quem está com pelo menos uma aba aberta agora.
function listarOnline() {
  return Array.from(clientes.keys()).filter((id) => clientes.get(id).size > 0);
}

// Quando a pessoa fechou a última aba (null se está online ou nunca conectou desde o boot).
function vistoPorUltimo(idUsuario) {
  if (online(idUsuario)) return null;
  return ultimaVez.get(Number(idUsuario)) || null;
}

module.exports = { inscrever, publicar, publicarTodos, online, listarOnline, vistoPorUltimo };
