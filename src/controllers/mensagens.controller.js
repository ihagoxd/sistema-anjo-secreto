'use strict';

/**
 * "Direct" com DOIS mundos:
 *  - ANJO SECRETO (topo, campanha ativa): canais do jogo, tema próprio.
 *      · "Seu anjo"      → anônimo, você NÃO sabe quem é.
 *      · "Seu protegido" → você fala COMO anjo secreto; ele(a) recebe como "Seu anjo"
 *                          e NUNCA sabe que é você.
 *  - ESCRITÓRIO: conversa 1:1 normal (com nome) com QUALQUER pessoa aprovada,
 *      inclusive o seu protegido (papo normal, além do canal secreto).
 *
 * ANONIMATO: a lista do escritório inclui todo mundo (menos eu). O meu anjo aparece
 * ali como pessoa normal — nunca destacado nem escondido (esconder revelaria quem é).
 * As mensagens do canal do jogo chegam ao destino de forma genérica ("Seu anjo").
 */
const campanhaService = require('../services/campanha.service');
const sorteioService = require('../services/sorteio.service');
const mensagemService = require('../services/mensagem.service');
const dmService = require('../services/mensagemDireta.service');
const usuarioModel = require('../models/usuario.model');
const postModel = require('../models/post.model');
const storyModel = require('../models/story.model');
const storyService = require('../services/story.service');
const { HUMORES } = require('../config/humores');

const MSG = {
  SEM_CAMPANHA: 'Nenhuma campanha em andamento.',
  NAO_ATIVA: 'A campanha não está em andamento.',
  VAZIA: 'Escreva uma mensagem.',
  LONGA: `A mensagem é longa demais (máx. ${mensagemService.LIMITE} caracteres).`,
  SEM_VINCULO: 'Você não está participando desta campanha.',
  ALVO_INVALIDO: 'Destinatário inválido.',
  NAO_PERMITIDO: 'Não foi possível editar a mensagem.',
};

// Monta o "estado" comum (lista de conversas + jogo) — usado no GET.
async function montarContexto(me) {
  const campanha = await campanhaService.buscarCampanhaAtiva();
  let protegido = null;
  if (campanha) {
    const p = await sorteioService.buscarProtegidoDoAnjo(campanha.id_campanha, me);
    if (p) protegido = await usuarioModel.buscarPorId(p.id_usuario); // pega foto/humor
  }
  const participaJogo = !!(campanha && protegido);

  let unread = { anjo: 0, protegido: 0 };
  if (participaJogo) unread = await mensagemService.contarNaoLidasPorTipo(campanha.id_campanha, me);

  // Lista do escritório: TODOS os aprovados/ativos, menos eu.
  // O protegido aparece aqui também (papo normal, com nome) — além do canal secreto de anjo.
  let equipe = (await usuarioModel.listarAprovados(me, 200)).filter((u) => u.id_usuario !== me);

  const resumo = await dmService.resumoConversas(me);
  equipe = equipe.map((u) => ({
    ...u,
    souProtegido: !!(protegido && u.id_usuario === protegido.id_usuario),
    ultima: resumo.ultima[u.id_usuario] || null,
    naoLidas: resumo.naoLidas[u.id_usuario] || 0,
  }));
  equipe.sort((a, b) => {
    const au = a.naoLidas > 0 ? 1 : 0;
    const bu = b.naoLidas > 0 ? 1 : 0;
    if (au !== bu) return bu - au;
    const at = a.ultima ? new Date(a.ultima.criado_em).getTime() : 0;
    const bt = b.ultima ? new Date(b.ultima.criado_em).getTime() : 0;
    if (at !== bt) return bt - at;
    return String(a.nome).localeCompare(String(b.nome));
  });

  return { campanha, protegido, participaJogo, unread, equipe };
}

// Renderiza o Direct com (opcionalmente) uma conversa aberta.
// sel: { tipo: 'anjo'|'protegido'|'u', id? }
async function renderInbox(req, res, sel) {
  const me = req.session.usuario.id_usuario;
  const ctx = await montarContexto(me);

  let conversa = null;
  if (sel) {
    if (sel.tipo === 'anjo' && ctx.participaJogo) {
      await mensagemService.marcarThreadLida(ctx.campanha.id_campanha, me, 'anjo');
      ctx.unread.anjo = 0;
      const c = await mensagemService.listarConversa(ctx.campanha.id_campanha, me);
      conversa = { tipo: 'anjo', escopo: 'game', secreto: true, anonimo: true,
        titulo: 'Seu anjo', rotulo: 'anônimo · você não sabe quem é', rotuloResposta: 'Seu anjo',
        mensagens: c.comAnjo, action: '/mensagens/anjo', placeholder: 'Mensagem…' };
    } else if (sel.tipo === 'protegido' && ctx.participaJogo) {
      await mensagemService.marcarThreadLida(ctx.campanha.id_campanha, me, 'protegido');
      ctx.unread.protegido = 0;
      const c = await mensagemService.listarConversa(ctx.campanha.id_campanha, me);
      conversa = { tipo: 'protegido', escopo: 'game', secreto: true,
        titulo: ctx.protegido.nome, rotulo: 'você é o anjo secreto dele(a) 🎭', rotuloResposta: 'Seu protegido',
        foto: ctx.protegido.foto_perfil, mensagens: c.comProtegido, action: '/mensagens/protegido',
        placeholder: 'Mensagem anônima…' };
    } else if (sel.tipo === 'u') {
      const outro = await usuarioModel.buscarPorId(sel.id);
      if (outro && outro.status === 'APROVADO' && outro.ativo && outro.id_usuario !== me) {
        await dmService.marcarLidas(me, outro.id_usuario);
        const msgs = await dmService.listarConversaCom(me, outro.id_usuario);
        conversa = { tipo: 'u', escopo: 'dm', id: outro.id_usuario, titulo: outro.nome, rotulo: '@' + outro.usuario, rotuloResposta: outro.nome,
          usuario: outro.usuario, foto: outro.foto_perfil, mensagens: msgs, action: '/mensagens/u/' + outro.id_usuario,
          placeholder: 'Mensagem…', prefill: String(sel.prefill || '').slice(0, 500) };
        // A conversa aberta some da contagem de não lidas na lista.
        const alvo = ctx.equipe.find((u) => u.id_usuario === outro.id_usuario);
        if (alvo) alvo.naoLidas = 0;
      }
    }
  }

  if (conversa && conversa.mensagens) {
    await anexarPreviasDePost(conversa.mensagens, me);
    await anexarCartoesDeStory(conversa.mensagens);
    anexarCitacoes(conversa.mensagens);
  }

  // Anéis de story na lista (como no Instagram): dourado = story não visto; apagado = já visto.
  const aneis = await storyService.resumoAneis(me);
  ctx.equipe.forEach((u) => {
    u.temStory = !!aneis[u.id_usuario];
    u.storyVisto = !!(aneis[u.id_usuario] && aneis[u.id_usuario].tudoVisto);
  });

  // Notas (estilo Instagram): "Sua nota" + quem definiu o status hoje.
  // Identidade PÚBLICA do escritório — nada aqui toca nos canais secretos do jogo.
  const humorEu = await usuarioModel.buscarHumorHoje(me);
  const notas = ctx.equipe.filter((u) => u.humor);

  res.render('mensagens/index', {
    titulo: 'Mensagens',
    semCampanha: !ctx.campanha,
    participaJogo: ctx.participaJogo,
    protegido: ctx.protegido,
    unread: ctx.unread,
    equipe: ctx.equipe,
    conversa,
    limite: mensagemService.LIMITE,
    humorEu,
    humores: HUMORES,
    notas,
    tenhoStory: !!aneis[me],
  });
}

// "Responder" (citação estilo WhatsApp): a mensagem citada está na MESMA conversa
// já carregada — anexa a prévia dela (quem escreveu + trecho) sem ir ao banco.
function anexarCitacoes(mensagens) {
  const porId = {};
  mensagens.forEach((m) => { porId[m.id_mensagem] = m; });
  mensagens.forEach((m) => {
    if (!m.respondendo_a) return;
    const q = porId[m.respondendo_a];
    if (!q) return;
    let trecho = q.apagada ? '🚫 Mensagem apagada'
      : (q.texto || (q.imagem ? '📷 Foto' : q.audio ? '🎤 Mensagem de voz' : q.video ? '🎬 Vídeo' : ''));
    if (trecho.length > 90) trecho = `${trecho.slice(0, 90)}…`;
    m.quote = { minha: !!q.minha, texto: trecho };
  });
}

// Mensagem que referencia um story (resposta/encaminhamento) vira um CARTÃO na
// bolha — clicável enquanto o story estiver no ar (24 h), como no Instagram.
async function anexarCartoesDeStory(mensagens) {
  const cacheAutor = {};
  const cacheAtivo = {};
  for (const m of mensagens) {
    if (!m.story_autor || m.apagada_em) continue;
    if (!(m.story_autor in cacheAutor)) cacheAutor[m.story_autor] = await usuarioModel.buscarPorId(m.story_autor);
    let ativo = false;
    if (m.story_ref) {
      if (!(m.story_ref in cacheAtivo)) {
        const s = await storyModel.buscarPorId(m.story_ref);
        cacheAtivo[m.story_ref] = !!(s && Date.now() - new Date(s.criado_em).getTime() < 24 * 3600 * 1000);
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

// Mensagem com link de publicação do mural (/p/ID) vira um cartão de preview na
// bolha — como compartilhar post no Direct do Instagram.
async function anexarPreviasDePost(mensagens, me) {
  const cache = {};
  for (const m of mensagens) {
    const match = /\/p\/(\d+)/.exec(m.texto || '');
    if (!match) continue;
    const id = Number(match[1]);
    if (!(id in cache)) cache[id] = await postModel.buscarFeedUm(id, me).catch(() => null);
    if (!cache[id]) continue;
    m.postPrev = cache[id];
    // O que sobra da mensagem além do link (se só mandou o post, a bolha mostra só o cartão)
    m.textoSemLink = m.texto
      .replace(/Olha esse post do mural:\s*/i, '')
      .replace(/https?:\/\/\S*\/p\/\d+\S*/g, '')
      .trim();
  }
}

const getInbox = (req, res, next) => renderInbox(req, res, null).catch(next);
const getAnjo = (req, res, next) => renderInbox(req, res, { tipo: 'anjo' }).catch(next);
const getProtegido = (req, res, next) => renderInbox(req, res, { tipo: 'protegido' }).catch(next);
const getDireta = (req, res, next) => renderInbox(req, res, { tipo: 'u', id: Number(req.params.id), prefill: req.query.texto }).catch(next);

// ---------- Envio ----------
// Mídia opcional da mensagem (multer .fields): imagem e/ou áudio de voz.
function midiaDaRequisicao(req) {
  const um = (campo) => {
    const f = (req.files && req.files[campo] && req.files[campo][0]) || null;
    return f ? '/uploads/' + f.filename : null;
  };
  return { imagem: um('imagem'), audio: um('audio'), video: um('video') };
}

async function enviarJogo(req, res, next, alvo) {
  try {
    const me = req.session.usuario.id_usuario;
    const campanha = await campanhaService.buscarCampanhaAtiva();
    const destino = '/mensagens/' + alvo;
    const { imagem, audio, video } = midiaDaRequisicao(req);
    if (!campanha) { req.session.flash = { erro: MSG.SEM_CAMPANHA }; return res.redirect(destino); }
    const r = await mensagemService.enviarMensagemAnonima(campanha.id_campanha, me, alvo, req.body.mensagem, imagem, audio, video, req.body.responder_a || null);
    if (!r.ok) req.session.flash = { erro: MSG[r.motivo] || 'Não foi possível enviar.' };
    res.redirect(destino);
  } catch (err) { next(err); }
}
const postAnjo = (req, res, next) => enviarJogo(req, res, next, 'anjo');
const postProtegido = (req, res, next) => enviarJogo(req, res, next, 'protegido');

async function postDireta(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const id = Number(req.params.id);
    const { imagem, audio, video } = midiaDaRequisicao(req);
    const ajax = (req.get('x-requested-with') || '') === 'fetch';
    const r = await dmService.enviar(me, id, req.body.mensagem, imagem, audio, video, null, req.body.responder_a || null);
    if (!r.ok) {
      if (ajax) return res.status(400).json({ erro: MSG[r.motivo] || 'Não foi possível enviar.' });
      req.session.flash = { erro: MSG[r.motivo] || 'Não foi possível enviar.' };
    }
    if (ajax) return res.json({ ok: true });
    res.redirect('/mensagens/u/' + id);
  } catch (err) { next(err); }
}

// ---------- Estado da lista (polling leve): não lidas por contato + prévias ----------
// Alimenta os badges ao vivo do Direct (quantas mensagens e de quem), sem F5.
async function getEstado(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const campanha = await campanhaService.buscarCampanhaAtiva();
    let unread = { anjo: 0, protegido: 0 };
    if (campanha) {
      const p = await sorteioService.buscarProtegidoDoAnjo(campanha.id_campanha, me);
      if (p) unread = await mensagemService.contarNaoLidasPorTipo(campanha.id_campanha, me);
    }
    const resumo = await dmService.resumoConversas(me);
    const previas = {};
    Object.keys(resumo.ultima || {}).forEach((id) => {
      const u = resumo.ultima[id];
      previas[id] = { minha: !!u.minha, texto: u.texto || '📎 mídia' };
    });
    res.json({ anjo: unread.anjo, protegido: unread.protegido, porContato: resumo.naoLidas || {}, previas });
  } catch (err) {
    next(err);
  }
}

// ---------- Edição (AJAX → JSON) ----------
async function postEditar(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const escopo = req.body.escopo;
    const id = Number(req.body.id);
    let r;
    if (escopo === 'dm') r = await dmService.editar(me, id, req.body.texto);
    else r = await mensagemService.editarMensagem(me, id, req.body.texto);
    if (!r.ok) return res.status(400).json({ erro: MSG[r.motivo] || 'Não foi possível editar.' });
    res.json({ ok: true, texto: r.texto, editada: true });
  } catch (err) { next(err); }
}

// ---------- Apagar para todos (AJAX → JSON) ----------
async function postApagar(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const escopo = req.body.escopo;
    const id = Number(req.body.id);
    let r;
    if (escopo === 'dm') r = await dmService.apagar(me, id);
    else r = await mensagemService.apagarMensagem(me, id);
    if (!r.ok) return res.status(400).json({ erro: 'Não foi possível apagar a mensagem.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

module.exports = { getInbox, getAnjo, getProtegido, getDireta, postAnjo, postProtegido, postDireta, postEditar, postApagar, getEstado };
