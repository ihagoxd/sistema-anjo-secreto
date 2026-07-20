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

    res.locals.notifNaoLidas = await notificacaoService.contarNaoLidas(me);
    res.locals.notifRecentes = await notificacaoService.listar(me, 8);

    // Campanha ativa: alimenta o contador de não lidas e a roleta de revelação.
    const campanha = await campanhaService.buscarCampanhaAtiva();
    let totalMsg = await dmService.contarNaoLidasTotal(me);
    if (campanha) totalMsg += await mensagemService.contarNaoLidas(campanha.id_campanha, me);
    res.locals.msgNaoLidas = totalMsg;

    // Roleta (modal, 1x por sessão) — só participante que já tem protegido sorteado.
    if (campanha && u.tipo_usuario === 'PARTICIPANTE') {
      const protegido = await sorteioService.buscarProtegidoDoAnjo(campanha.id_campanha, me);
      if (protegido) {
        const pf = await usuarioModel.buscarPorId(protegido.id_usuario);
        const eq = await participanteService.listarPorCampanha(campanha.id_campanha);
        res.locals.roleta = {
          campId: campanha.id_campanha,
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
