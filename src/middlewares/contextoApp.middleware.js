'use strict';

/**
 * Carrega em res.locals, para todo GET de usuário logado:
 *  - notifNaoLidas: contagem para o badge do sino
 *  - notifRecentes: últimas notificações (dropdown do sino)
 *  - aniversariantes: quem faz aniversário hoje (para o modal), já com os "gostos"
 *
 * Também gera (1x por sessão/dia) as notificações de aniversário para o usuário.
 */
const notificacaoService = require('../services/notificacao.service');
const avisoService = require('../services/aviso.service');
const usuarioModel = require('../models/usuario.model');
const preferenciaService = require('../services/preferencia.service');
const campanhaService = require('../services/campanha.service');
const mensagemService = require('../services/mensagem.service');
const dmService = require('../services/mensagemDireta.service');
const sorteioService = require('../services/sorteio.service');
const participanteService = require('../services/participante.service');
const { montarGostos, PRESENTE } = require('../config/gostos');

function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}

async function carregarContextoApp(req, res, next) {
  try {
    const u = req.session.usuario;
    if (!u || req.method !== 'GET') return next();
    // Rotas de dados das notificações (SSE, polling, JSON) não renderizam layout:
    // pular o carregamento pesado evita consultas inúteis a cada conexão.
    if (/^\/notificacoes\/(stream|novas|lista|preferencias|push\/)/.test(req.path)) return next();
    const me = u.id_usuario;

    // Aniversários primeiro (podem gerar notificações), depois carrega badge/recentes.
    const aniversariantes = await usuarioModel.aniversariantesHoje();
    if (aniversariantes.length) {
      const hoje = new Date().toISOString().slice(0, 10);
      res.locals.hojeISO = hoje;
      if (req.session.aniversariosDia !== hoje) {
        await notificacaoService.gerarAniversarios(me, aniversariantes);
        req.session.aniversariosDia = hoje;
      }

      const enriquecidos = [];
      for (const a of aniversariantes) {
        const prefs = await preferenciaService.buscarPreferenciasPorUsuario(a.id_usuario);
        const msg = `Feliz aniversário, ${primeiroNome(a.nome)}! 🎉🎂 Que seu dia seja incrível!`;
        enriquecidos.push({
          id_usuario: a.id_usuario,
          nome: a.nome,
          usuario: a.usuario,
          foto_perfil: a.foto_perfil,
          souEu: a.id_usuario === me,
          gostos: montarGostos(prefs, PRESENTE),
          msgParabens: encodeURIComponent(msg),
        });
      }
      res.locals.aniversariantes = enriquecidos;
    }

    // Avisos da administração ainda não vistos: viram um card animado sobre a tela.
    // (Não na própria página de criar avisos, onde já tem a prévia; nem na página do aviso.)
    if (!/^\/(admin\/avisos|avisos\/)/.test(req.path)) {
      const pendentes = await avisoService.pendentesPara(me);
      if (pendentes.length) res.locals.avisosPendentes = pendentes;
    }

    res.locals.notifNaoLidas = await notificacaoService.contarNaoLidas(me);
    res.locals.notifRecentes = (await notificacaoService.listar(me, { limite: 8 })).itens;

    // Campanha ativa: alimenta o contador de não lidas e a roleta de revelação.
    const campanha = await campanhaService.buscarCampanhaAtiva();
    let totalMsg = await dmService.contarNaoLidasTotal(me);
    if (campanha) totalMsg += await mensagemService.contarNaoLidas(campanha.id_campanha, me);
    res.locals.msgNaoLidas = totalMsg;

    // Tutorial passo a passo: em QUALQUER página, para participante que ainda não viu
    // (perfil completo ou já sorteado). O marcador vai no layout; o JS leva a pessoa ao
    // Feed e segue por todas as telas. ?tour=1 (no Feed) repete a qualquer hora.
    // (Lido do banco, não da sessão: o sorteio "reabre" o tutorial para todo mundo.)
    if (u.tipo_usuario === 'PARTICIPANTE') {
      const roletaOk = !!(campanha && await sorteioService.buscarProtegidoDoAnjo(campanha.id_campanha, me));
      let tour = req.path === '/feed' && req.query.tour === '1';
      if (!tour && (u.perfil_completo || roletaOk)) tour = !(await usuarioModel.tutorialVisto(me));
      res.locals.tour = tour;
      res.locals.tourSorteio = roletaOk;
      res.locals.primeiroNome = primeiroNome(u.nome);
    }

    // Roleta (modal, 1x por sessão) — só participante que já tem protegido sorteado.
    if (campanha && u.tipo_usuario === 'PARTICIPANTE') {
      const protegido = await sorteioService.buscarProtegidoDoAnjo(campanha.id_campanha, me);
      if (protegido) {
        const pf = await usuarioModel.buscarPorId(protegido.id_usuario);
        const eq = await participanteService.listarPorCampanha(campanha.id_campanha);
        res.locals.roleta = {
          // A chave inclui o PROTEGIDO: se o sorteio for refeito, a roleta aparece
          // de novo para todo mundo revelando o novo par.
          campId: `${campanha.id_campanha}-${protegido.id_usuario}`,
          nomes: eq.filter((x) => x.nome).map((x) => x.nome).join('|'),
          nome: protegido.nome,
          foto_perfil: pf ? pf.foto_perfil : null,
        };
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { carregarContextoApp };
