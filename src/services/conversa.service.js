'use strict';

/**
 * Prepara as mensagens do Direct (e do canal anônimo do jogo) para a tela:
 * citação do "responder", cartão de story, prévia de post, "Visto" — e renderiza
 * a BOLHA pronta (HTML do mesmo partial da página) para entregar por AJAX/SSE,
 * sem recarregar nada.
 */
const usuarioModel = require('../models/usuario.model');
const postModel = require('../models/post.model');
const storyModel = require('../models/story.model');
const dmModel = require('../models/mensagemDireta.model');
const mensagemModel = require('../models/mensagem.model');
const grupoModel = require('../models/grupo.model');
const render = require('./render.service');

const STORY_ATIVO_MS = 24 * 3600 * 1000;

// Trecho curto de uma mensagem citada (texto ou "📷 Foto", "🎤 Mensagem de voz"…).
function trechoDe(q) {
  let trecho = q.apagada ? '🚫 Mensagem apagada'
    : (q.texto || (q.imagem ? '📷 Foto' : q.audio ? '🎤 Mensagem de voz' : q.video ? '🎬 Vídeo' : ''));
  if (trecho.length > 90) trecho = `${trecho.slice(0, 90)}…`;
  return trecho;
}

// "Responder" (citação estilo WhatsApp): a citada costuma estar na mesma lista;
// "extras" cobre o caso da mensagem nova (bolha avulsa), com a citada buscada no banco.
function anexarCitacoes(mensagens, extras = []) {
  const porId = {};
  extras.forEach((m) => { porId[m.id_mensagem] = m; });
  mensagens.forEach((m) => { porId[m.id_mensagem] = m; });
  mensagens.forEach((m) => {
    if (!m.respondendo_a) return;
    const q = porId[m.respondendo_a];
    if (!q) return;
    m.quote = { minha: !!q.minha, texto: trechoDe(q), autor: q.autor ? String(q.autor.nome || '').split(' ')[0] : null };
  });
}

// Mensagem que referencia um story (resposta/encaminhamento/menção) vira um CARTÃO
// na bolha — clicável enquanto o story estiver no ar (24 h), como no Instagram.
async function anexarCartoesDeStory(mensagens) {
  const cacheAutor = {};
  const cacheAtivo = {};
  for (const m of mensagens) {
    if (!m.story_autor || m.apagada) continue;
    if (!(m.story_autor in cacheAutor)) cacheAutor[m.story_autor] = await usuarioModel.buscarPorId(m.story_autor);
    let ativo = false;
    if (m.story_ref) {
      if (!(m.story_ref in cacheAtivo)) {
        const s = await storyModel.buscarPorId(m.story_ref);
        cacheAtivo[m.story_ref] = !!(s && Date.now() - new Date(s.criado_em).getTime() < STORY_ATIVO_MS);
      }
      ativo = cacheAtivo[m.story_ref];
    }
    const autor = cacheAutor[m.story_autor];
    m.storyPrev = {
      tipo: m.story_tipo || 'encaminhado',
      id_story: m.story_ref,
      id_autor: m.story_autor,
      usuario: autor ? autor.usuario : '?',
      ativo,
    };
  }
}

// Mensagem com link de publicação do mural (/p/ID) vira um cartão de preview.
async function anexarPreviasDePost(mensagens, me) {
  const cache = {};
  for (const m of mensagens) {
    const match = /\/p\/(\d+)/.exec(m.texto || '');
    if (!match) continue;
    const id = Number(match[1]);
    if (!(id in cache)) cache[id] = await postModel.buscarFeedUm(id, me).catch(() => null);
    if (!cache[id]) continue;
    m.postPrev = cache[id];
    m.textoSemLink = m.texto
      .replace(/Olha esse post do mural:\s*/i, '')
      .replace(/https?:\/\/\S*\/p\/\d+\S*/g, '')
      .trim();
  }
}

// "Visto" (como no Instagram): só debaixo da ÚLTIMA mensagem minha, e só se já foi lida.
function marcarVisto(mensagens) {
  for (let i = mensagens.length - 1; i >= 0; i--) {
    const m = mensagens[i];
    if (!m.minha) continue;
    if (m.lida && !m.apagada) m.mostrarVisto = true;
    break;
  }
}

async function prepararTodas(mensagens, me) {
  await anexarPreviasDePost(mensagens, me);
  await anexarCartoesDeStory(mensagens);
  anexarCitacoes(mensagens);
  marcarVisto(mensagens);
}

// ---------- Bolha avulsa (mensagem nova) ----------

function itemDm(r, idObservador) {
  return {
    id_mensagem: r.id_mensagem,
    minha: r.id_remetente === idObservador,
    texto: r.texto, imagem: r.imagem, audio: r.audio, video: r.video,
    apagada: !!r.apagada_em, editado_em: r.editado_em, criado_em: r.criado_em,
    respondendo_a: r.respondendo_a, lida: !!r.lida,
    story_ref: r.story_ref, story_autor: r.story_autor, story_tipo: r.story_tipo,
  };
}

function itemJogo(r, idObservador) {
  return {
    id_mensagem: r.id_mensagem,
    minha: r.id_usuario_origem === idObservador,
    texto: r.mensagem, imagem: r.imagem, audio: r.audio, video: r.video,
    apagada: !!r.apagada_em, editado_em: r.editado_em, criado_em: r.criado_em,
    respondendo_a: r.respondendo_a, lida: !!r.lida,
  };
}

// HTML da bolha de uma DM, do ponto de vista de quem vai ver (minha/deles).
async function bolhaDm(idMensagem, idObservador, conversa) {
  const r = await dmModel.buscarPorId(idMensagem);
  if (!r) return null;
  const m = itemDm(r, idObservador);
  const extras = [];
  if (m.respondendo_a) {
    const q = await dmModel.buscarPorId(m.respondendo_a);
    if (q) extras.push(itemDm(q, idObservador));
  }
  await anexarPreviasDePost([m], idObservador);
  await anexarCartoesDeStory([m]);
  anexarCitacoes([m], extras);
  return render.partial('dmBolha', Object.assign({ conversa }, m));
}

// HTML da bolha de uma mensagem do canal anônimo (anjo/protegido).
async function bolhaJogo(idMensagem, idObservador, conversa) {
  const r = await mensagemModel.buscarMensagem(idMensagem);
  if (!r) return null;
  const m = itemJogo(r, idObservador);
  const extras = [];
  if (m.respondendo_a) {
    const q = await mensagemModel.buscarMensagem(m.respondendo_a);
    if (q) extras.push(itemJogo(q, idObservador));
  }
  anexarCitacoes([m], extras);
  return render.partial('dmBolha', Object.assign({ conversa }, m));
}

// Mensagem de grupo do ponto de vista de quem vai ver; "autor" aparece nas bolhas dos outros.
function itemGrupo(r, idObservador) {
  return {
    id_mensagem: r.id_mensagem,
    minha: r.id_remetente === idObservador,
    sistema: !!r.sistema,
    texto: r.texto, imagem: r.imagem, audio: r.audio, video: r.video,
    apagada: !!r.apagada_em, editado_em: r.editado_em, criado_em: r.criado_em,
    respondendo_a: r.respondendo_a, lida: false,
    autor: r.id_remetente ? {
      id: r.id_remetente, nome: r.remetente_nome, usuario: r.remetente_usuario, foto: r.remetente_foto,
      cor: (Number(r.id_remetente) % 8) + 1,
    } : null,
  };
}

// HTML da bolha de uma mensagem de grupo (sistema vira a pílula central).
async function bolhaGrupo(idMensagem, idObservador, conversa) {
  const r = await grupoModel.buscarMensagem(idMensagem);
  if (!r) return null;
  const m = itemGrupo(r, idObservador);
  if (m.sistema) return render.partial('dmSistema', m);
  const extras = [];
  if (m.respondendo_a) {
    const q = await grupoModel.buscarMensagem(m.respondendo_a);
    if (q) extras.push(itemGrupo(q, idObservador));
  }
  await anexarPreviasDePost([m], idObservador);
  anexarCitacoes([m], extras);
  return render.partial('dmBolha', Object.assign({ conversa }, m));
}

// Prévia curta para a lista de conversas (igual à do servidor na primeira carga).
function previaDe(m) {
  return m.texto || (m.imagem ? '📷 Foto' : m.audio ? '🎤 Mensagem de voz' : m.video ? '🎬 Vídeo' : '📎 mídia');
}

module.exports = { prepararTodas, anexarCitacoes, anexarCartoesDeStory, anexarPreviasDePost, marcarVisto, bolhaDm, bolhaJogo, bolhaGrupo, itemGrupo, previaDe };
