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
  TESTE: {
    emoji: '🔔', categoria: 'sistema', temAtor: false,
    titulo: () => 'Notificação de teste',
    texto: () => 'Tudo certo! É assim que você será avisado.',
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
    titulo: def.titulo(row, vezes),
    texto: def.texto(row, vezes),
    detalhe: row.tipo === 'SORTEIO' ? null : (row.detalhe || null),
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

function notificarTeste(idUsuario) {
  return criar({ idUsuario, tipo: 'TESTE', idAtor: null, link: '/notificacoes' });
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
  excluir,
  excluirTodas,
  buscarPrefs,
  salvarPrefs,
  notificarMensagemDireta,
  notificarMensagemJogo,
  notificarCurtida,
  notificarComentario,
  notificarRepost,
  notificarMencao,
  notificarSorteio,
  gerarAniversarios,
  notificarTeste,
};
