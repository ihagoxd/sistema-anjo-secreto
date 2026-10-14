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
 *
 * TEMPO REAL: enviar é AJAX (a bolha volta pronta em HTML) e a mensagem chega na
 * hora para o outro lado por SSE — junto com "digitando…", "Visto" e presença.
 */
const campanhaService = require('../services/campanha.service');
const sorteioService = require('../services/sorteio.service');
const mensagemService = require('../services/mensagem.service');
const dmService = require('../services/mensagemDireta.service');
const grupoService = require('../services/grupo.service');
const render = require('../services/render.service');
const { apagarUpload } = require('../config/upload');
const conversaService = require('../services/conversa.service');
const notificacaoService = require('../services/notificacao.service');
const tempoReal = require('../services/tempoReal.service');
const usuarioModel = require('../models/usuario.model');
const dmTemaModel = require('../models/dmTema.model');
const storyService = require('../services/story.service');
const { HUMORES } = require('../config/humores');
const { TEMAS_CHAT, temaChatValido, nomeTemaChat } = require('../config/temasChat');

const MSG = {
  SEM_CAMPANHA: 'Nenhuma campanha em andamento.',
  NAO_ATIVA: 'A campanha não está em andamento.',
  VAZIA: 'Escreva uma mensagem.',
  LONGA: `A mensagem é longa demais (máx. ${mensagemService.LIMITE} caracteres).`,
  SEM_VINCULO: 'Você não está participando desta campanha.',
  ALVO_INVALIDO: 'Destinatário inválido.',
  NAO_PERMITIDO: 'Não foi possível editar a mensagem.',
  NOME: 'Dê um nome ao grupo.',
  SEM_MEMBROS: 'Escolha pelo menos uma pessoa.',
  SO_ADMIN: 'Só quem criou o grupo pode remover participantes.',
};

function ehFetch(req) {
  return (req.get('x-requested-with') || '') === 'fetch';
}

// Contextos da bolha (o partial dmBolha lê @root.conversa.{titulo,rotuloResposta,escopo})
const CTX_ANJO = { tipo: 'anjo', escopo: 'game', titulo: 'Seu anjo', rotuloResposta: 'Seu anjo' };
function ctxProtegido(nome) { return { tipo: 'protegido', escopo: 'game', titulo: nome, rotuloResposta: 'Seu protegido' }; }
function ctxDm(nome) { return { tipo: 'u', escopo: 'dm', titulo: nome, rotuloResposta: nome }; }
function ctxGrupo(nome) { return { tipo: 'g', escopo: 'g', titulo: nome, rotuloResposta: nome, grupo: true }; }

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
    online: tempoReal.online(u.id_usuario),
  }));
  const ordem = (a, b) => {
    const au = a.naoLidas > 0 ? 1 : 0;
    const bu = b.naoLidas > 0 ? 1 : 0;
    if (au !== bu) return bu - au;
    const at = a.ultima ? new Date(a.ultima.criado_em).getTime() : 0;
    const bt = b.ultima ? new Date(b.ultima.criado_em).getTime() : 0;
    if (at !== bt) return bt - at;
    return String(a.nome).localeCompare(String(b.nome));
  };
  equipe.sort(ordem);
  // Grupos entram na mesma lista das pessoas, ordenados pela última mensagem (como no Instagram).
  const grupos = await grupoService.listarDoUsuario(me);
  const lista = equipe.concat(grupos).sort(ordem);

  return { campanha, protegido, participaJogo, unread, equipe, lista };
}

// Avisa o OUTRO lado que eu li a thread (vira "Visto" debaixo da última mensagem dele)
// e tira do meu sino as notificações de mensagem desse canal.
async function avisarLeitura(me, canal, idOutro, campanha) {
  try {
    await notificacaoService.lerConversa(me, canal, idOutro);
    if (canal === 'g') return; // grupo não tem "Visto"
    if (canal === 'u') { tempoReal.publicar(idOutro, 'dm-lida', { por: me, canal: 'u' }); return; }
    if (!campanha) return;
    if (canal === 'anjo') {
      const a = await sorteioService.buscarAnjoDoProtegido(campanha.id_campanha, me);
      if (a) tempoReal.publicar(a.id_usuario, 'dm-lida', { canal: 'protegido' }); // para o anjo, sou o protegido dele
    } else if (canal === 'protegido') {
      const p = await sorteioService.buscarProtegidoDoAnjo(campanha.id_campanha, me);
      if (p) tempoReal.publicar(p.id_usuario, 'dm-lida', { canal: 'anjo' }); // para o protegido, sou o anjo dele
    }
  } catch (e) { /* tempo real nunca derruba a página */ }
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
      conversa = Object.assign({ secreto: true, anonimo: true, rotulo: 'anônimo · você não sabe quem é',
        mensagens: c.comAnjo, action: '/mensagens/anjo', placeholder: 'Mensagem…' }, CTX_ANJO);
      avisarLeitura(me, 'anjo', null, ctx.campanha);
    } else if (sel.tipo === 'protegido' && ctx.participaJogo) {
      await mensagemService.marcarThreadLida(ctx.campanha.id_campanha, me, 'protegido');
      ctx.unread.protegido = 0;
      const c = await mensagemService.listarConversa(ctx.campanha.id_campanha, me);
      conversa = Object.assign({ secreto: true, rotulo: 'você é o anjo secreto dele(a) 🎭',
        foto: ctx.protegido.foto_perfil, mensagens: c.comProtegido, action: '/mensagens/protegido',
        placeholder: 'Mensagem anônima…' }, ctxProtegido(ctx.protegido.nome));
      avisarLeitura(me, 'protegido', null, ctx.campanha);
    } else if (sel.tipo === 'u') {
      const outro = await usuarioModel.buscarPorId(sel.id);
      if (outro && outro.status === 'APROVADO' && outro.ativo && outro.id_usuario !== me) {
        await dmService.marcarLidas(me, outro.id_usuario);
        const msgs = await dmService.listarConversaCom(me, outro.id_usuario);
        conversa = Object.assign({ id: outro.id_usuario, rotulo: '@' + outro.usuario,
          usuario: outro.usuario, foto: outro.foto_perfil, mensagens: msgs, action: '/mensagens/u/' + outro.id_usuario,
          placeholder: 'Mensagem…', prefill: String(sel.prefill || '').slice(0, 500),
          online: tempoReal.online(outro.id_usuario),
          tema: await dmTemaModel.buscar(me, outro.id_usuario) }, ctxDm(outro.nome));
        // A conversa aberta some da contagem de não lidas na lista.
        const alvo = ctx.equipe.find((u) => u.id_usuario === outro.id_usuario);
        if (alvo) alvo.naoLidas = 0;
        avisarLeitura(me, 'u', outro.id_usuario, null);
      }
    } else if (sel.tipo === 'g') {
      const g = await grupoService.abrir(me, sel.id);
      if (g) {
        await grupoService.marcarLidas(me, sel.id);
        const msgs = await grupoService.listarConversa(sel.id, me);
        conversa = Object.assign({
          id: sel.id, rotulo: g.membros.length + ' participantes', foto: g.grupo.foto, membros: g.membros,
          souAdmin: g.membros.some((m) => m.id_usuario === me && m.admin),
          amostra: g.membros.filter((m) => m.id_usuario !== me).slice(0, 2).map((m) => ({ nome: m.nome, foto: m.foto_perfil })),
          mensagens: msgs, action: '/mensagens/g/' + sel.id, placeholder: 'Mensagem…',
        }, ctxGrupo(g.grupo.nome));
        const item = ctx.lista.find((i) => i.ehGrupo && i.id_grupo === sel.id);
        if (item) { item.naoLidas = 0; item.ativa = true; }
        avisarLeitura(me, 'g', sel.id, null);
      }
    }
  }

  if (conversa && conversa.mensagens) await conversaService.prepararTodas(conversa.mensagens, me);

  // Anéis de story na lista (como no Instagram): dourado = story não visto; apagado = já visto.
  const aneis = await storyService.resumoAneis(me);
  ctx.equipe.forEach((u) => {
    u.temStory = !!aneis[u.id_usuario];
    u.storyVisto = !!(aneis[u.id_usuario] && aneis[u.id_usuario].tudoVisto);
  });

  // Notas (estilo Instagram): "Sua nota" + quem definiu o status hoje.
  const notaEu = await usuarioModel.buscarNota(me);
  const notas = ctx.equipe.filter((u) => u.nota)
    .map((u, i) => ({ u, i, k: u.temStory && !u.storyVisto ? 0 : 1 }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map((x) => x.u);

  res.render('mensagens/index', {
    titulo: 'Mensagens',
    semCampanha: !ctx.campanha,
    participaJogo: ctx.participaJogo,
    protegido: ctx.protegido,
    unread: ctx.unread,
    equipe: ctx.equipe,
    lista: ctx.lista,
    conversa,
    limite: mensagemService.LIMITE,
    notaEu,
    sugestoesNota: HUMORES,
    notas,
    tenhoStory: !!aneis[me],
    // Temas de conversa (só o Direct do escritório; o canal do Anjo mantém o visual próprio)
    temasChat: conversa && conversa.tipo === 'u'
      ? TEMAS_CHAT.map((t) => Object.assign({ ativo: t.chave === conversa.tema }, t))
      : null,
  });
}

// ---------- Tema da conversa (DM): vale para os dois lados, troca ao vivo ----------
async function postTema(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const id = Number(req.params.id);
    const tema = String(req.body.tema || 'padrao');
    const outro = await usuarioModel.buscarPorId(id);
    if (!outro || outro.id_usuario === me || !temaChatValido(tema)) return res.status(400).json({ ok: false, erro: 'Tema inválido.' });
    await dmTemaModel.salvar(me, id, tema, me);
    const eu = await usuarioModel.buscarPorId(me);
    const nome = nomeTemaChat(tema);
    tempoReal.publicar(id, 'dm-tema', { canal: 'u', de: me, tema, nome, quem: eu ? eu.nome.split(' ')[0] : 'Alguém' });
    tempoReal.publicar(me, 'dm-tema', { canal: 'u', de: me, para: id, tema, nome, eco: true });
    res.json({ ok: true, tema, nome });
  } catch (err) { next(err); }
}

const getInbox = (req, res, next) => renderInbox(req, res, null).catch(next);
const getAnjo = (req, res, next) => renderInbox(req, res, { tipo: 'anjo' }).catch(next);
const getProtegido = (req, res, next) => renderInbox(req, res, { tipo: 'protegido' }).catch(next);
const getDireta = (req, res, next) => renderInbox(req, res, { tipo: 'u', id: Number(req.params.id), prefill: req.query.texto }).catch(next);
const getGrupo = (req, res, next) => renderInbox(req, res, { tipo: 'g', id: Number(req.params.id) }).catch(next);

// ---------- Envio ----------
// Mídia opcional da mensagem (multer .fields): imagem e/ou áudio de voz.
function midiaDaRequisicao(req) {
  const um = (campo) => {
    const f = (req.files && req.files[campo] && req.files[campo][0]) || null;
    return f ? '/uploads/' + f.filename : null;
  };
  return { imagem: um('imagem'), audio: um('audio'), video: um('video') };
}

// Canal do jogo: 'anjo' (falo com meu anjo) | 'protegido' (falo com meu protegido).
// Quem recebe vê a mensagem no canal OPOSTO: mandei pro protegido → ele lê em "Seu anjo".
async function enviarJogo(req, res, next, alvo) {
  try {
    const me = req.session.usuario.id_usuario;
    const campanha = await campanhaService.buscarCampanhaAtiva();
    const destino = '/mensagens/' + alvo;
    const ajax = ehFetch(req);
    const { imagem, audio, video } = midiaDaRequisicao(req);
    if (!campanha) {
      if (ajax) return res.status(400).json({ erro: MSG.SEM_CAMPANHA });
      req.session.flash = { erro: MSG.SEM_CAMPANHA }; return res.redirect(destino);
    }
    const r = await mensagemService.enviarMensagemAnonima(campanha.id_campanha, me, alvo, req.body.mensagem, imagem, audio, video, req.body.responder_a || null);
    if (!r.ok) {
      if (ajax) return res.status(400).json({ erro: MSG[r.motivo] || 'Não foi possível enviar.' });
      req.session.flash = { erro: MSG[r.motivo] || 'Não foi possível enviar.' };
      return res.redirect(destino);
    }
    // Bolhas prontas: a minha (resposta do AJAX) e a do outro lado (vai por SSE)
    const canalDeles = alvo === 'protegido' ? 'anjo' : 'protegido';
    const ctxMeu = alvo === 'anjo' ? CTX_ANJO : ctxProtegido('Seu protegido');
    let nomeDeles = 'Seu protegido';
    if (canalDeles === 'protegido') { const u = await usuarioModel.buscarPorId(me); nomeDeles = u ? u.nome : nomeDeles; }
    const ctxDeles = canalDeles === 'anjo' ? CTX_ANJO : ctxProtegido(nomeDeles);
    const [htmlMeu, htmlDeles] = await Promise.all([
      conversaService.bolhaJogo(r.id_mensagem, me, ctxMeu),
      conversaService.bolhaJogo(r.id_mensagem, r.destino, ctxDeles),
    ]);
    const previa = conversaService.previaDe({ texto: String(req.body.mensagem || '').trim(), imagem, audio, video });
    tempoReal.publicar(r.destino, 'dm', { canal: canalDeles, id_mensagem: r.id_mensagem, html: htmlDeles, previa });
    tempoReal.publicar(me, 'dm', { canal: alvo, id_mensagem: r.id_mensagem, html: htmlMeu, previa, eco: true });
    if (ajax) return res.json({ ok: true, id_mensagem: r.id_mensagem, html: htmlMeu });
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
    const ajax = ehFetch(req);
    const r = await dmService.enviar(me, id, req.body.mensagem, imagem, audio, video, null, req.body.responder_a || null);
    if (!r.ok) {
      if (ajax) return res.status(400).json({ erro: MSG[r.motivo] || 'Não foi possível enviar.' });
      req.session.flash = { erro: MSG[r.motivo] || 'Não foi possível enviar.' };
      return res.redirect('/mensagens/u/' + id);
    }
    const [eu, outro] = await Promise.all([usuarioModel.buscarPorId(me), usuarioModel.buscarPorId(id)]);
    const [htmlMeu, htmlDeles] = await Promise.all([
      conversaService.bolhaDm(r.id_mensagem, me, ctxDm(outro ? outro.nome : '')),
      conversaService.bolhaDm(r.id_mensagem, id, ctxDm(eu ? eu.nome : '')),
    ]);
    const previa = conversaService.previaDe({ texto: String(req.body.mensagem || '').trim(), imagem, audio, video });
    tempoReal.publicar(id, 'dm', { canal: 'u', de: me, id_mensagem: r.id_mensagem, html: htmlDeles, previa });
    tempoReal.publicar(me, 'dm', { canal: 'u', de: me, para: id, id_mensagem: r.id_mensagem, html: htmlMeu, previa, eco: true });
    if (ajax) return res.json({ ok: true, id_mensagem: r.id_mensagem, html: htmlMeu });
    res.redirect('/mensagens/u/' + id);
  } catch (err) { next(err); }
}

async function postGrupo(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const id = Number(req.params.id);
    const { imagem, audio, video } = midiaDaRequisicao(req);
    const ajax = ehFetch(req);
    const r = await grupoService.enviar(me, id, req.body.mensagem, imagem, audio, video, req.body.responder_a || null);
    if (!r.ok) {
      if (ajax) return res.status(400).json({ erro: MSG[r.motivo] || 'Não foi possível enviar.' });
      req.session.flash = { erro: MSG[r.motivo] || 'Não foi possível enviar.' };
      return res.redirect('/mensagens/g/' + id);
    }
    const ctx = ctxGrupo(r.grupo.nome);
    // Para os outros a bolha é igual (deles, com o autor): renderiza uma vez só.
    const [htmlMeu, htmlDeles, eu] = await Promise.all([
      conversaService.bolhaGrupo(r.id_mensagem, me, ctx),
      conversaService.bolhaGrupo(r.id_mensagem, 0, ctx),
      usuarioModel.buscarPorId(me),
    ]);
    const corpo = conversaService.previaDe({ texto: String(req.body.mensagem || '').trim(), imagem, audio, video });
    const previa = (eu ? eu.nome.split(' ')[0] : 'Alguém') + ': ' + corpo;
    r.membros.forEach((m) => tempoReal.publicar(m, 'dm', { canal: 'g', grupo: id, de: me, id_mensagem: r.id_mensagem, html: htmlDeles, previa }));
    tempoReal.publicar(me, 'dm', { canal: 'g', grupo: id, de: me, id_mensagem: r.id_mensagem, html: htmlMeu, previa: corpo, eco: true });
    if (ajax) return res.json({ ok: true, id_mensagem: r.id_mensagem, html: htmlMeu });
    res.redirect('/mensagens/g/' + id);
  } catch (err) { next(err); }
}

// ---------- Grupos: criar, adicionar gente, sair, renomear ----------
// Mensagem de sistema (pílula) para todo mundo do grupo, ao vivo.
async function avisarGrupo(idGrupo, nomeGrupo, idMensagem, texto, membros) {
  const html = await conversaService.bolhaGrupo(idMensagem, 0, ctxGrupo(nomeGrupo));
  membros.forEach((m) => tempoReal.publicar(m, 'dm', { canal: 'g', grupo: idGrupo, id_mensagem: idMensagem, html, previa: texto, sistema: true }));
}

async function postCriarGrupo(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const r = await grupoService.criar(me, req.body.nome, req.body.membros);
    if (!r.ok) return res.status(400).json({ ok: false, erro: MSG[r.motivo] || 'Não foi possível criar o grupo.' });
    r.membros.forEach((m) => tempoReal.publicar(m, 'grupo', { acao: 'novo', id_grupo: r.id_grupo, nome: r.nome }));
    res.json({ ok: true, id_grupo: r.id_grupo, url: '/mensagens/g/' + r.id_grupo });
  } catch (err) { next(err); }
}

async function postGrupoMembros(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const id = Number(req.params.id);
    const r = await grupoService.adicionar(me, id, req.body.membros);
    if (!r.ok) return res.status(400).json({ ok: false, erro: MSG[r.motivo] || 'Não foi possível adicionar.' });
    r.novos.forEach((m) => tempoReal.publicar(m, 'grupo', { acao: 'novo', id_grupo: id, nome: r.grupo.nome }));
    await avisarGrupo(id, r.grupo.nome, r.id_mensagem, r.texto, r.membros);
    res.json({ ok: true, novos: r.novos });
  } catch (err) { next(err); }
}

async function postGrupoSair(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const id = Number(req.params.id);
    const r = await grupoService.sair(me, id);
    if (!r.ok) return res.status(400).json({ ok: false, erro: 'Você não está neste grupo.' });
    tempoReal.publicar(me, 'grupo', { acao: 'saiu', id_grupo: id });
    if (!r.apagado) await avisarGrupo(id, r.grupo.nome, r.id_mensagem, r.texto, r.membros);
    res.json({ ok: true, url: '/mensagens' });
  } catch (err) { next(err); }
}

async function postGrupoNome(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const id = Number(req.params.id);
    const r = await grupoService.renomear(me, id, req.body.nome);
    if (!r.ok) return res.status(400).json({ ok: false, erro: MSG[r.motivo] || 'Não foi possível renomear.' });
    r.membros.forEach((m) => tempoReal.publicar(m, 'grupo', { acao: 'nome', id_grupo: id, nome: r.nome }));
    await avisarGrupo(id, r.nome, r.id_mensagem, r.texto, r.membros);
    res.json({ ok: true, nome: r.nome });
  } catch (err) { next(err); }
}

async function postGrupoFoto(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const id = Number(req.params.id);
    const caminho = req.file ? '/uploads/' + req.file.filename : null;
    if (!caminho) return res.status(400).json({ ok: false, erro: 'Escolha uma imagem.' });
    const r = await grupoService.definirFoto(me, id, caminho);
    if (!r.ok) { apagarUpload(caminho); return res.status(400).json({ ok: false, erro: 'Você não está neste grupo.' }); }
    r.membros.forEach((m) => tempoReal.publicar(m, 'grupo', { acao: 'foto', id_grupo: id, foto: r.foto }));
    await avisarGrupo(id, r.grupo.nome, r.id_mensagem, r.texto, r.membros);
    res.json({ ok: true, foto: r.foto });
  } catch (err) { next(err); }
}

async function postGrupoFotoRemover(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const id = Number(req.params.id);
    const r = await grupoService.definirFoto(me, id, null);
    if (!r.ok) return res.status(400).json({ ok: false, erro: 'Você não está neste grupo.' });
    r.membros.forEach((m) => tempoReal.publicar(m, 'grupo', { acao: 'foto', id_grupo: id, foto: null }));
    await avisarGrupo(id, r.grupo.nome, r.id_mensagem, r.texto, r.membros);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

async function postGrupoRemoverMembro(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const id = Number(req.params.id);
    const alvo = Number(req.body.id);
    const r = await grupoService.removerMembro(me, id, alvo);
    if (!r.ok) return res.status(400).json({ ok: false, erro: MSG[r.motivo] || 'Não foi possível remover.' });
    tempoReal.publicar(alvo, 'grupo', { acao: 'saiu', id_grupo: id });
    await avisarGrupo(id, r.grupo.nome, r.id_mensagem, r.texto, r.membros);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// Item da lista (HTML pronto) para entrar ao vivo quando me colocam num grupo novo.
async function getGrupoItem(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const id = Number(req.params.id);
    const item = (await grupoService.listarDoUsuario(me)).find((g) => g.id_grupo === id);
    if (!item) return res.status(404).json({ ok: false });
    res.json({ ok: true, html: await render.partial('convGrupo', item) });
  } catch (err) { next(err); }
}

// ---------- "digitando…" (sem banco: só um evento para o outro lado) ----------
async function postDigitando(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const canal = req.params.canal; // 'anjo' | 'protegido' | 'u' | 'g'
    if (canal === 'g') {
      const id = Number(req.params.id);
      const g = await grupoService.abrir(me, id);
      if (g) {
        const eu = g.membros.find((m) => m.id_usuario === me);
        const nome = eu ? eu.nome.split(' ')[0] : '';
        g.membros.forEach((m) => { if (m.id_usuario !== me) tempoReal.publicar(m.id_usuario, 'digitando', { de: me, canal: 'g', grupo: id, nome }); });
      }
    } else if (canal === 'u') {
      tempoReal.publicar(Number(req.params.id), 'digitando', { de: me, canal: 'u' });
    } else {
      const campanha = await campanhaService.buscarCampanhaAtiva();
      if (campanha) {
        if (canal === 'anjo') {
          const a = await sorteioService.buscarAnjoDoProtegido(campanha.id_campanha, me);
          if (a) tempoReal.publicar(a.id_usuario, 'digitando', { canal: 'protegido' });
        } else if (canal === 'protegido') {
          const p = await sorteioService.buscarProtegidoDoAnjo(campanha.id_campanha, me);
          if (p) tempoReal.publicar(p.id_usuario, 'digitando', { canal: 'anjo' });
        }
      }
    }
    res.status(204).end();
  } catch (err) { next(err); }
}

// ---------- Li as mensagens (conversa aberta recebeu algo por SSE) ----------
async function postLidas(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const canal = req.params.canal;
    if (canal === 'g') {
      const id = Number(req.params.id);
      await grupoService.marcarLidas(me, id);
      await avisarLeitura(me, 'g', id, null);
    } else if (canal === 'u') {
      const id = Number(req.params.id);
      await dmService.marcarLidas(me, id);
      await avisarLeitura(me, 'u', id, null);
    } else {
      const campanha = await campanhaService.buscarCampanhaAtiva();
      if (campanha && (canal === 'anjo' || canal === 'protegido')) {
        await mensagemService.marcarThreadLida(campanha.id_campanha, me, canal);
        await avisarLeitura(me, canal, null, campanha);
      }
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// ---------- Estado da lista (polling de reserva): não lidas por contato + prévias ----------
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
    const grupos = {};
    (await grupoService.listarDoUsuario(me)).forEach((g) => { grupos[g.id_grupo] = { n: g.naoLidas, previa: g.ultima ? g.ultima.texto : null }; });
    res.json({ anjo: unread.anjo, protegido: unread.protegido, porContato: resumo.naoLidas || {}, previas, grupos, online: tempoReal.listarOnline() });
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
    else if (escopo === 'g') r = await grupoService.editar(me, id, req.body.texto);
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
    else if (escopo === 'g') r = await grupoService.apagar(me, id);
    else r = await mensagemService.apagarMensagem(me, id);
    if (!r.ok) return res.status(400).json({ erro: 'Não foi possível apagar a mensagem.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

module.exports = {
  getInbox, getAnjo, getProtegido, getDireta, postAnjo, postProtegido, postDireta, postEditar, postApagar, getEstado, postDigitando, postLidas, postTema,
  getGrupo, postGrupo, postCriarGrupo, postGrupoMembros, postGrupoSair, postGrupoNome, getGrupoItem,
  postGrupoFoto, postGrupoFotoRemover, postGrupoRemoverMembro,
};
