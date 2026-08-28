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
        titulo: 'Seu anjo', rotulo: 'anônimo · você não sabe quem é',
        mensagens: c.comAnjo, action: '/mensagens/anjo', placeholder: 'Mensagem…' };
    } else if (sel.tipo === 'protegido' && ctx.participaJogo) {
      await mensagemService.marcarThreadLida(ctx.campanha.id_campanha, me, 'protegido');
      ctx.unread.protegido = 0;
      const c = await mensagemService.listarConversa(ctx.campanha.id_campanha, me);
      conversa = { tipo: 'protegido', escopo: 'game', secreto: true,
        titulo: ctx.protegido.nome, rotulo: 'você é o anjo secreto dele(a) 🎭',
        foto: ctx.protegido.foto_perfil, mensagens: c.comProtegido, action: '/mensagens/protegido',
        placeholder: 'Mensagem anônima…' };
    } else if (sel.tipo === 'u') {
      const outro = await usuarioModel.buscarPorId(sel.id);
      if (outro && outro.status === 'APROVADO' && outro.ativo && outro.id_usuario !== me) {
        await dmService.marcarLidas(me, outro.id_usuario);
        const msgs = await dmService.listarConversaCom(me, outro.id_usuario);
        conversa = { tipo: 'u', escopo: 'dm', id: outro.id_usuario, titulo: outro.nome, rotulo: '@' + outro.usuario,
          usuario: outro.usuario, foto: outro.foto_perfil, mensagens: msgs, action: '/mensagens/u/' + outro.id_usuario,
          placeholder: 'Mensagem…', prefill: String(sel.prefill || '').slice(0, 500) };
        // A conversa aberta some da contagem de não lidas na lista.
        const alvo = ctx.equipe.find((u) => u.id_usuario === outro.id_usuario);
        if (alvo) alvo.naoLidas = 0;
      }
    }
  }

  res.render('mensagens/index', {
    titulo: 'Mensagens',
    semCampanha: !ctx.campanha,
    participaJogo: ctx.participaJogo,
    protegido: ctx.protegido,
    unread: ctx.unread,
    equipe: ctx.equipe,
    conversa,
    limite: mensagemService.LIMITE,
  });
}

const getInbox = (req, res, next) => renderInbox(req, res, null).catch(next);
const getAnjo = (req, res, next) => renderInbox(req, res, { tipo: 'anjo' }).catch(next);
const getProtegido = (req, res, next) => renderInbox(req, res, { tipo: 'protegido' }).catch(next);
const getDireta = (req, res, next) => renderInbox(req, res, { tipo: 'u', id: Number(req.params.id), prefill: req.query.texto }).catch(next);

// ---------- Envio ----------
async function enviarJogo(req, res, next, alvo) {
  try {
    const me = req.session.usuario.id_usuario;
    const campanha = await campanhaService.buscarCampanhaAtiva();
    const destino = '/mensagens/' + alvo;
    const imagem = req.file ? '/uploads/' + req.file.filename : null;
    if (!campanha) { req.session.flash = { erro: MSG.SEM_CAMPANHA }; return res.redirect(destino); }
    const r = await mensagemService.enviarMensagemAnonima(campanha.id_campanha, me, alvo, req.body.mensagem, imagem);
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
    const imagem = req.file ? '/uploads/' + req.file.filename : null;
    const r = await dmService.enviar(me, id, req.body.mensagem, imagem);
    if (!r.ok) req.session.flash = { erro: MSG[r.motivo] || 'Não foi possível enviar.' };
    res.redirect('/mensagens/u/' + id);
  } catch (err) { next(err); }
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

module.exports = { getInbox, getAnjo, getProtegido, getDireta, postAnjo, postProtegido, postDireta, postEditar };
