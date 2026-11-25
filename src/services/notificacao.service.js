'use strict';

/**
 * Notificações do sistema — centro de notificações completo.
 *
 *  - Cada evento (mensagem, curtida, comentário, menção, aniversário, sorteio…)
 *    vira uma notificação rica: título, ação, prévia do conteúdo, miniatura.
 *  - Ao criar, o aviso é EMPURRADO na hora para as abas abertas do destinatário
 *    (SSE — tempoReal.service) e para os aparelhos com push ativo (push.service).
 *  - Preferências por usuário: som, vibração, banner, aviso do navegador, push
 *    e silenciar por categoria (mensagens / social / aniversário / sistema).
 *  - Agrupamento estilo Instagram na listagem ("Ana, Bia e mais 3 curtiram seu post",
 *    "Seu anjo te mandou 4 mensagens").
 *
 * As funções "notificar*" NUNCA lançam (uma falha aqui não pode quebrar
 * o envio de mensagem / curtida / etc.) — apenas registram no console.
 *
 * ANONIMATO: mensagens do canal do jogo entram SEM ator (id_ator NULL) e com
 * texto genérico ("Seu anjo" / "Seu protegido"), nunca revelando quem é o anjo.
 */
const notificacaoModel = require('../models/notificacao.model');
const tempoReal = require('./tempoReal.service');
const push = require('./push.service');

const PREVIA_MAX = 90;

// ---------- Catálogo de tipos ----------
// titulo/texto recebem a linha do banco (com ator_nome etc.) e o nº de itens agrupados.
const TIPOS = {
  MENSAGEM: {
    emoji: '💬', categoria: 'mensagens', temAtor: true,
    titulo: (r) => r.ator_nome || 'Alguém',
    texto: (r, n) => (n > 1 ? `te mandou ${n} mensagens` : 'te mandou uma mensagem'),
  },
  MENSAGEM_ANJO: {
    emoji: '😇', categoria: 'mensagens', temAtor: false,
    titulo: () => 'Seu anjo',
    texto: (r, n) => (n > 1 ? `te mandou ${n} mensagens` : 'te mandou uma mensagem'),
  },
  MENSAGEM_PROTEGIDO: {
    emoji: '🎁', categoria: 'mensagens', temAtor: false,
    titulo: () => 'Seu protegido',
    texto: (r, n) => (n > 1 ? `te mandou ${n} mensagens` : 'te mandou uma mensagem'),
  },
  GRUPO: {
    emoji: '👥', categoria: 'mensagens', temAtor: true,
    titulo: (r) => r.ator_nome || 'Alguém',
    texto: (r, n) => (n > 1 ? `mandou ${n} mensagens no grupo` : 'mandou uma mensagem no grupo'),
  },
  GRUPO_ADD: {
    emoji: '👥', categoria: 'mensagens', temAtor: true,
    titulo: (r) => r.ator_nome || 'Alguém',
    texto: () => 'te adicionou a um grupo',
  },
  CURTIDA: {
    emoji: '❤️', categoria: 'social', temAtor: true, agrupaPor: 'ref',
    titulo: nomes,
    texto: (r, n) => (n > 1 ? 'curtiram seu post' : 'curtiu seu post'),
  },
  COMENTARIO: {
    emoji: '💭', categoria: 'social', temAtor: true, agrupaPor: 'ref',
    titulo: nomes,
    texto: (r, n) => (n > 1 ? 'comentaram no seu post' : 'comentou no seu post'),
  },
  RESPOSTA: {
    emoji: '↩️', categoria: 'social', temAtor: true, agrupaPor: 'ref',
    titulo: nomes,
    texto: (r, n) => (n > 1 ? 'responderam ao seu comentário' : 'respondeu ao seu comentário'),
  },
  REPOST: {
    emoji: '🔁', categoria: 'social', temAtor: true, agrupaPor: 'ref',
    titulo: nomes,
    texto: (r, n) => (n > 1 ? 'repostaram seu post' : 'repostou seu post'),
  },
  MENCAO: {
    emoji: '📣', categoria: 'social', temAtor: true,
    titulo: (r) => r.ator_nome || 'Alguém',
    texto: () => 'mencionou você',
  },
  COLAB: {
    emoji: '👥', categoria: 'social', temAtor: true,
    titulo: (r) => r.ator_nome || 'Alguém',
    texto: () => 'te marcou em um post em dupla',
  },
  ANIVERSARIO: {
    emoji: '🎂', categoria: 'aniversario', temAtor: true,
    titulo: (r) => `Hoje é aniversário de ${primeiroNome(r.ator_nome)}!`,
    texto: () => 'Mande os parabéns 🎉',
  },
  ANIVERSARIO_SEU: {
    emoji: '🎉', categoria: 'aniversario', temAtor: false,
    titulo: () => 'Feliz aniversário!',
    texto: () => 'Que o seu dia seja incrível 🎂',
  },
  SORTEIO: {
    emoji: '🎲', categoria: 'sistema', temAtor: false,
    titulo: (r) => (r.detalhe === 'refeito' ? 'O sorteio foi refeito!' : 'O sorteio saiu!'),
    texto: () => 'Toque para descobrir quem é o seu protegido',
  },
  AVISO: {
    emoji: '📢', categoria: 'sistema', temAtor: false,
    titulo: () => 'Novo aviso',
    texto: () => 'da administração',
  },
  TESTE: {
    emoji: '🔔', categoria: 'sistema', temAtor: false,
    titulo: () => 'Notificação de teste',
    texto: () => 'Tudo certo! É assim que você será avisado.',
  },
  TEMA: {
    emoji: '🎨', categoria: 'sistema', temAtor: false,
    titulo: () => 'O app está de cara nova!',
    texto: () => 'a rede mudou de visual — toque para ver',
  },
};

const PREFS_PADRAO = {
  som: true, vibrar: true, banner: true, navegador: true, push: true,
  mensagens: true, social: true, aniversario: true, sistema: true,
};

function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || 'alguém';
}

// "Ana Souza" (sozinha, nome completo), "Ana e Bia", "Ana, Bia e mais 3 pessoas"
function nomes(r) {
  const brutos = r.atores && r.atores.length ? r.atores : [r.ator_nome || 'Alguém'];
  if (brutos.length === 1) return brutos[0];
  const lista = brutos.map(primeiroNome);
  if (lista.length === 2) return `${lista[0]} e ${lista[1]}`;
  const resto = lista.length - 2;
  return `${lista[0]}, ${lista[1]} e mais ${resto} ${resto === 1 ? 'pessoa' : 'pessoas'}`;
}

// Prévia curta de um conteúdo de mensagem (texto ou mídia).
function previaMensagem({ texto, imagem, audio, video, story } = {}) {
  let p = null;
  const t = String(texto || '').trim().replace(/\s+/g, ' ');
  if (t) p = t.length > PREVIA_MAX ? `${t.slice(0, PREVIA_MAX - 1)}…` : t;
  else if (imagem) p = '📷 Foto';
  else if (audio) p = '🎤 Mensagem de voz';
  else if (video) p = '🎥 Vídeo';
  if (story) p = p ? `↩️ ${p}` : '↩️ Respondeu ao seu story';
  return p;
}

function previaTexto(texto) {
  const t = String(texto || '').trim().replace(/\s+/g, ' ');
  if (!t) return null;
  return t.length > PREVIA_MAX ? `${t.slice(0, PREVIA_MAX - 1)}…` : t;
}

function normalizarPrefs(json) {
  const p = Object.assign({}, PREFS_PADRAO);
  if (json && typeof json === 'object') {
    for (const k of Object.keys(PREFS_PADRAO)) if (typeof json[k] === 'boolean') p[k] = json[k];
  }
  return p;
}

// Ícone (SVG) de cada tipo — aparece no cantinho do avatar, colorido pela categoria.
const ICONES_TIPO = {
  MENSAGEM: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 1 1 21 11.5z"/></svg>',
  MENSAGEM_ANJO: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>',
  MENSAGEM_PROTEGIDO: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>',
  GRUPO: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
  GRUPO_ADD: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>',
  CURTIDA: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  COMENTARIO: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  RESPOSTA: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>',
  REPOST: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
  MENCAO: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.9 7.9"/></svg>',
  COLAB: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
  ANIVERSARIO: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v3"/><path d="M12 8v3"/><path d="M17 8v3"/></svg>',
  ANIVERSARIO_SEU: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v3"/><path d="M12 8v3"/><path d="M17 8v3"/></svg>',
  SORTEIO: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>',
  AVISO: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  TESTE: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  TEMA: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="1.2"/><circle cx="17.5" cy="10.5" r="1.2"/><circle cx="8.5" cy="7.5" r="1.2"/><circle cx="6.5" cy="12.5" r="1.2"/><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.8-1.7 1.7-1.7H16a6 6 0 0 0 6-6c0-4.4-4.5-8.4-10-8.4z"/></svg>',
};

// Linha do banco (ou grupo) → objeto pronto para as views / JSON / push.
function renderizar(row) {
  const def = TIPOS[row.tipo] || {
    emoji: '🔔', categoria: 'sistema', temAtor: !!row.ator_nome,
    titulo: (r) => r.ator_nome || 'Aviso', texto: () => '',
  };
  const vezes = row.vezes || 1;
  const temAtor = !!(def.temAtor && row.ator_nome);
  return {
    id: row.id_notificacao,
    ids: row.ids || [row.id_notificacao],
    tipo: row.tipo,
    categoria: def.categoria,
    emoji: def.emoji,
    icSvg: ICONES_TIPO[row.tipo] || ICONES_TIPO.TESTE,
    titulo: def.titulo(row, vezes),
    texto: def.texto(row, vezes),
    detalhe: row.tipo === 'SORTEIO' ? null : (row.detalhe || null),
    ref: row.ref || null,
    imagem: row.imagem || null,
    temAtor,
    ator_nome: temAtor ? row.ator_nome : null,
    ator_usuario: temAtor ? row.ator_usuario : null,
    ator_foto: temAtor ? row.ator_foto : null,
    ator2_nome: temAtor ? (row.ator2_nome || null) : null,
    ator2_foto: temAtor ? (row.ator2_foto || null) : null,
    vezes: vezes > 1 ? vezes : 0,
    link: row.link || '/notificacoes',
    lida: !!row.lida,
    criado_em: row.criado_em,
  };
}

/**
 * Agrupa linhas parecidas (curtidas no mesmo post, várias mensagens do mesmo
 * remetente). O grupo fica na posição da notificação mais recente.
 */
function agrupar(rows) {
  const grupos = new Map();
  const saida = [];
  for (const r of rows) {
    const def = TIPOS[r.tipo];
    let chave = null;
    if (def && def.agrupaPor === 'ref' && r.ref) chave = `${r.tipo}:${r.ref}`;
    else if (r.tipo === 'MENSAGEM' && r.id_ator) chave = `${r.tipo}:${r.id_ator}`;
    else if (r.tipo === 'MENSAGEM_ANJO' || r.tipo === 'MENSAGEM_PROTEGIDO') chave = r.tipo;

    if (chave && grupos.has(chave)) {
      const g = grupos.get(chave);
      g.vezes += 1;
      g.ids.push(r.id_notificacao);
      g.lida = g.lida && r.lida;
      if (r.ator_nome && !g.atoresIds.includes(r.id_ator)) {
        g.atoresIds.push(r.id_ator);
        g.atores.push(r.ator_nome);
        if (!g.ator2_nome) { g.ator2_nome = r.ator_nome; g.ator2_foto = r.ator_foto; }
      }
      continue;
    }
    const item = Object.assign({}, r, {
      vezes: 1, ids: [r.id_notificacao], atores: r.ator_nome ? [r.ator_nome] : [], atoresIds: [r.id_ator],
    });
    if (chave) grupos.set(chave, item);
    saida.push(item);
  }
  return saida;
}

async function listar(idUsuario, opts = {}) {
  const limite = opts.limite || 30;
  const rows = await notificacaoModel.listar(idUsuario, { limite, antesDe: opts.antesDe || 0, filtro: opts.filtro || 'todas' });
  const ultimaId = rows.length ? rows[rows.length - 1].id_notificacao : 0;
  return { itens: agrupar(rows).map(renderizar), temMais: rows.length === limite, ultimaId };
}

// Últimas N já renderizadas (sem agrupar): usadas pelo polling de reserva.
async function listarBrutas(idUsuario, limite = 8) {
  const rows = await notificacaoModel.listar(idUsuario, { limite });
  return rows.map(renderizar);
}

function contarNaoLidas(idUsuario) {
  return notificacaoModel.contarNaoLidas(idUsuario);
}

async function marcarLida(idNotificacao, idUsuario, idsExtras = []) {
  const r = await notificacaoModel.marcarLida(idNotificacao, idUsuario);
  if (idsExtras.length) await notificacaoModel.marcarLidas(idsExtras, idUsuario);
  await publicarContagem(idUsuario);
  return r;
}

async function marcarTodasLidas(idUsuario) {
  await notificacaoModel.marcarTodasLidas(idUsuario);
  await publicarContagem(idUsuario);
}

// Abri/li uma conversa: as notificações de mensagem dela viram lidas e o badge atualiza.
// canal: 'u' (DM com idOutro) | 'anjo' | 'protegido'
async function lerConversa(idUsuario, canal, idOutro = null) {
  const tipo = canal === 'u' ? 'MENSAGEM' : canal === 'g' ? 'GRUPO' : canal === 'anjo' ? 'MENSAGEM_ANJO' : 'MENSAGEM_PROTEGIDO';
  const n = await notificacaoModel.marcarLidasDeMensagens(idUsuario, tipo, (canal === 'u' || canal === 'g') ? Number(idOutro) : null);
  if (n) await publicarContagem(idUsuario);
}

async function excluir(ids, idUsuario) {
  const n = await notificacaoModel.excluir(ids, idUsuario);
  await publicarContagem(idUsuario);
  return n;
}

async function excluirTodas(idUsuario) {
  const n = await notificacaoModel.excluirTodas(idUsuario);
  await publicarContagem(idUsuario);
  return n;
}

async function buscarPrefs(idUsuario) {
  return normalizarPrefs(await notificacaoModel.buscarPrefs(idUsuario));
}

async function salvarPrefs(idUsuario, dados) {
  const p = normalizarPrefs(dados);
  await notificacaoModel.salvarPrefs(idUsuario, p);
  return p;
}

// Avisa as abas abertas que a contagem mudou (badge some/atualiza sem F5).
async function publicarContagem(idUsuario) {
  try {
    if (!tempoReal.online(idUsuario)) return;
    const count = await notificacaoModel.contarNaoLidas(idUsuario);
    tempoReal.publicar(idUsuario, 'contagem', { count });
  } catch (e) { /* silencioso */ }
}

// Payload que o service worker mostra como notificação do sistema.
function payloadPush(n) {
  const corpo = n.detalhe ? `${n.texto} · ${n.detalhe}` : n.texto;
  return {
    id: n.id,
    titulo: n.titulo,
    corpo,
    emoji: n.emoji,
    icone: n.ator_foto || '/img/icon-512.png',
    imagem: n.imagem || null,
    url: `/notificacoes/${n.id}/abrir`,
    tag: `anjo-${n.tipo}-${n.ids[0]}`,
  };
}

/**
 * Cria a notificação e a entrega: SSE para as abas abertas, push para os
 * aparelhos inscritos. Respeita as preferências do destinatário.
 */
async function criar(dados) {
  const { id_notificacao } = await notificacaoModel.inserir(dados);
  const row = await notificacaoModel.buscarPorId(id_notificacao);
  if (!row) return null;
  const n = renderizar(row);
  const prefs = normalizarPrefs(await notificacaoModel.buscarPrefs(dados.idUsuario));
  const silenciada = prefs[n.categoria] === false;

  const count = await notificacaoModel.contarNaoLidas(dados.idUsuario);
  tempoReal.publicar(dados.idUsuario, 'notificacao', {
    n, count, silenciada,
    prefs: { som: prefs.som, vibrar: prefs.vibrar, banner: prefs.banner, navegador: prefs.navegador },
  });

  if (!silenciada && prefs.push) {
    push.enviar(dados.idUsuario, payloadPush(n)).catch(() => {});
  }
  return n;
}

// ---------- Geradores (à prova de falha) ----------
async function seguro(fn) {
  try { await fn(); } catch (e) { console.error('[notificacao]', e.message); }
}

// conteudo: { texto, imagem, audio, video, story } da mensagem enviada (para a prévia)
function notificarMensagemDireta(idDestino, idRemetente, conteudo) {
  return seguro(() => criar({
    idUsuario: idDestino, tipo: 'MENSAGEM', idAtor: idRemetente,
    link: '/mensagens/u/' + idRemetente, ref: idRemetente, detalhe: previaMensagem(conteudo),
  }));
}

// Grupo: "Fulano mandou uma mensagem no grupo" (detalhe = nome do grupo · prévia)
function notificarGrupo(idDestino, idRemetente, idGrupo, nomeGrupo, conteudo) {
  return seguro(() => criar({
    idUsuario: idDestino, tipo: 'GRUPO', idAtor: idRemetente,
    link: '/mensagens/g/' + idGrupo, ref: idGrupo, detalhe: `${nomeGrupo} · ${previaMensagem(conteudo) || ''}`,
  }));
}
function notificarGrupoAdd(idDestino, idAtor, idGrupo, nomeGrupo) {
  return seguro(() => criar({
    idUsuario: idDestino, tipo: 'GRUPO_ADD', idAtor, link: '/mensagens/g/' + idGrupo, ref: idGrupo, detalhe: nomeGrupo,
  }));
}

// alvo recebido: 'protegido' => o destino é o PROTEGIDO (recebeu do anjo, anônimo)
//                'anjo'      => o destino é o ANJO      (recebeu do protegido)
function notificarMensagemJogo(idDestino, alvo, conteudo) {
  const tipo = alvo === 'protegido' ? 'MENSAGEM_ANJO' : 'MENSAGEM_PROTEGIDO';
  const link = alvo === 'protegido' ? '/mensagens/anjo' : '/mensagens/protegido';
  return seguro(() => criar({ idUsuario: idDestino, tipo, idAtor: null, link, detalhe: previaMensagem(conteudo) }));
}

function notificarCurtida(idDono, idAtor, idPost, imagemPost = null) {
  if (idDono === idAtor) return Promise.resolve();
  return seguro(() => criar({
    idUsuario: idDono, tipo: 'CURTIDA', idAtor, link: '/p/' + idPost, ref: idPost, imagem: imagemPost,
  }));
}

function notificarComentario(idDono, idAtor, idPost, texto = null, imagemPost = null) {
  if (idDono === idAtor) return Promise.resolve();
  return seguro(() => criar({
    idUsuario: idDono, tipo: 'COMENTARIO', idAtor, link: '/p/' + idPost, ref: idPost,
    detalhe: previaTexto(texto), imagem: imagemPost,
  }));
}

function notificarResposta(idDono, idAtor, idPost, texto = null, imagemPost = null) {
  if (idDono === idAtor) return Promise.resolve();
  return seguro(() => criar({
    idUsuario: idDono, tipo: 'RESPOSTA', idAtor, link: '/p/' + idPost, ref: idPost,
    detalhe: previaTexto(texto), imagem: imagemPost,
  }));
}

function notificarRepost(idDono, idAtor, idPost, imagemPost = null) {
  if (idDono === idAtor) return Promise.resolve();
  return seguro(() => criar({
    idUsuario: idDono, tipo: 'REPOST', idAtor, link: '/p/' + idPost, ref: idPost, imagem: imagemPost,
  }));
}

// motivo: 'mencao' (padrão, @fulano no texto) | 'colab' (marcado como parceiro do post)
function notificarMencao(idDestino, idAtor, idPost, texto = null, motivo = 'mencao') {
  if (idDestino === idAtor) return Promise.resolve();
  return seguro(() => criar({
    idUsuario: idDestino, tipo: motivo === 'colab' ? 'COLAB' : 'MENCAO', idAtor,
    link: '/p/' + idPost, ref: idPost, detalhe: previaTexto(texto),
  }));
}

// Sorteio realizado/refeito: avisa cada participante.
async function notificarSorteio(idsUsuarios, refeito = false) {
  for (const id of idsUsuarios) {
    await seguro(() => criar({
      idUsuario: id, tipo: 'SORTEIO', idAtor: null, link: '/participante', detalhe: refeito ? 'refeito' : null,
    }));
  }
}

// Gera (1x por dia) uma notificação de aniversário para "idUsuario" sobre cada
// aniversariante — e um "feliz aniversário" para o próprio aniversariante.
async function gerarAniversarios(idUsuario, aniversariantes) {
  for (const a of aniversariantes) {
    const proprio = a.id_usuario === idUsuario;
    const tipo = proprio ? 'ANIVERSARIO_SEU' : 'ANIVERSARIO';
    await seguro(async () => {
      const jaTem = await notificacaoModel.existeHoje(idUsuario, tipo, proprio ? null : a.id_usuario);
      if (jaTem) return;
      await criar({
        idUsuario, tipo, idAtor: proprio ? null : a.id_usuario, link: proprio ? '/participante' : '/u/' + a.usuario,
      });
    });
  }
}

// Aviso da administração publicado: avisa cada destinatário (sino, toast e push).
async function notificarAviso(idsUsuarios, aviso) {
  const detalhe = previaTexto(`${aviso.emoji || ''} ${aviso.titulo} — ${aviso.mensagem}`);
  for (const id of idsUsuarios) {
    await seguro(() => criar({
      idUsuario: id, tipo: 'AVISO', idAtor: null, link: '/avisos/' + aviso.id_aviso, ref: aviso.id_aviso, detalhe,
    }));
  }
}

function notificarTeste(idUsuario) {
  return criar({ idUsuario, tipo: 'TESTE', idAtor: null, link: '/notificacoes' });
}

// Admin trocou o tema da rede: avisa cada pessoa. Com aba de preferências (Mês das
// Crianças), o toque leva direto para ela; senão, para o feed.
async function notificarTema(idsUsuarios, tema) {
  const link = tema.temPrefs ? '/participante/preferencias/tema' : '/feed';
  const detalhe = tema.temPrefs
    ? `${tema.emoji} ${tema.nome}: conte o que você quer ganhar!`
    : `${tema.emoji} Tema ${tema.nome}`;
  for (const id of idsUsuarios) {
    await seguro(() => criar({ idUsuario: id, tipo: 'TEMA', idAtor: null, link, detalhe }));
  }
}

module.exports = {
  TIPOS,
  PREFS_PADRAO,
  renderizar,
  agrupar,
  listar,
  listarBrutas,
  contarNaoLidas,
  marcarLida,
  marcarTodasLidas,
  lerConversa,
  excluir,
  excluirTodas,
  buscarPrefs,
  salvarPrefs,
  notificarMensagemDireta,
  notificarGrupo,
  notificarGrupoAdd,
  notificarMensagemJogo,
  notificarCurtida,
  notificarComentario,
  notificarResposta,
  notificarRepost,
  notificarMencao,
  notificarSorteio,
  notificarAviso,
  notificarTema,
  gerarAniversarios,
  notificarTeste,
};
