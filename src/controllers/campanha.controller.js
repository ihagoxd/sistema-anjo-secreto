'use strict';

const campanhaService = require('../services/campanha.service');
const participanteService = require('../services/participante.service');
const usuarioModel = require('../models/usuario.model');
const { registrarLog } = require('../services/log.service');

const MSG = {
  NOME: 'Dê um nome à campanha (mínimo 2 caracteres).',
  NAO_ENCONTRADA: 'Campanha não encontrada.',
  EM_ANDAMENTO: 'A campanha está em andamento — encerre antes de apagar.',
  ENCERRADA: 'Campanha encerrada não pode ser editada.',
  JA_ENCERRADA: 'Esta campanha já está encerrada.',
};

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// Sugestão do nome da campanha do mês (a brincadeira é mensal).
function sugestaoNome() {
  const d = new Date();
  const mes = MESES[d.getMonth()];
  return `Anjo Secreto · ${mes.charAt(0).toUpperCase() + mes.slice(1)} de ${d.getFullYear()}`;
}

function flash(req, tipo, msg) {
  req.session.flash = { [tipo]: msg };
}

async function getLista(req, res, next) {
  try {
    const campanhas = await campanhaService.listarCampanhas();
    // Campanha "em aberto" (rascunho ou em andamento): o botão de criar dá lugar ao atalho dela.
    const aberta = campanhas.find((c) => c.status !== 'ENCERRADA') || null;
    res.render('admin/campanhas', { titulo: 'Campanhas', campanhas, aberta, sugestao: sugestaoNome() });
  } catch (err) {
    next(err);
  }
}

async function postCriar(req, res, next) {
  try {
    // Um clique: sem nome no corpo, a campanha nasce configurada com o nome do mês.
    const r = await campanhaService.criarCampanha({
      nome: req.body.nome || sugestaoNome(),
      descricao: req.body.descricao,
    });
    if (!r.ok) {
      if (r.motivo === 'JA_EXISTE') {
        flash(req, 'erro', `A campanha "${r.campanha.nome}" ainda está em aberto — encerre-a antes de criar a próxima.`);
        return res.redirect(`/admin/campanhas/${r.campanha.id_campanha}`);
      }
      flash(req, 'erro', MSG[r.motivo] || 'Não foi possível criar a campanha.');
      return res.redirect('/admin/campanhas');
    }
    await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'CAMPANHA_CRIADA', descricao: r.campanha.nome, entidade: 'campanha', idReferencia: r.campanha.id_campanha, ip: req.ip });
    flash(req, 'sucesso', `Campanha "${r.campanha.nome}" criada.`);
    res.redirect(`/admin/campanhas/${r.campanha.id_campanha}`);
  } catch (err) {
    next(err);
  }
}

async function getDetalhe(req, res, next) {
  try {
    const campanha = await campanhaService.buscarCampanhaPorId(req.params.id_campanha);
    if (!campanha) {
      flash(req, 'erro', MSG.NAO_ENCONTRADA);
      return res.redirect('/admin/campanhas');
    }
    const [participantes, totalAptos] = await Promise.all([
      participanteService.listarPorCampanha(campanha.id_campanha),
      usuarioModel.contarParticipantesAptos(),
    ]);
    // Quantos vão entrar no sorteio: se já sorteou, os participantes gravados; senão, todos os aprovados.
    const totalNoSorteio = campanha.status === 'RASCUNHO' ? totalAptos : participantes.length;
    res.render('admin/campanha', {
      titulo: campanha.nome,
      campanha,
      participantes,
      totalParticipantes: participantes.length,
      totalNoSorteio,
      podeSortear: campanha.status === 'RASCUNHO' && totalAptos >= 3,
      faltam: Math.max(0, 3 - totalAptos),
    });
  } catch (err) {
    next(err);
  }
}

async function postEditar(req, res, next) {
  try {
    const r = await campanhaService.editarCampanha(req.params.id_campanha, { nome: req.body.nome, descricao: req.body.descricao });
    if (!r.ok) {
      flash(req, 'erro', MSG[r.motivo] || 'Não foi possível salvar.');
      return res.redirect(`/admin/campanhas/${req.params.id_campanha}`);
    }
    await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'CAMPANHA_EDITADA', descricao: r.campanha.nome, entidade: 'campanha', idReferencia: r.campanha.id_campanha, ip: req.ip });
    flash(req, 'sucesso', 'Campanha atualizada.');
    res.redirect(`/admin/campanhas/${req.params.id_campanha}`);
  } catch (err) {
    next(err);
  }
}

async function postEncerrar(req, res, next) {
  try {
    const r = await campanhaService.encerrarCampanha(req.params.id_campanha);
    if (r.ok) {
      await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'CAMPANHA_ENCERRADA', descricao: r.campanha.nome, entidade: 'campanha', idReferencia: r.campanha.id_campanha, ip: req.ip });
      flash(req, 'sucesso', `Campanha "${r.campanha.nome}" encerrada.`);
    } else {
      flash(req, 'erro', MSG[r.motivo] || 'Não foi possível encerrar.');
    }
    res.redirect(`/admin/campanhas/${req.params.id_campanha}`);
  } catch (err) {
    next(err);
  }
}

async function postApagar(req, res, next) {
  try {
    const r = await campanhaService.apagarCampanha(req.params.id_campanha);
    if (r.ok) {
      await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'CAMPANHA_APAGADA', descricao: r.campanha.nome, entidade: 'campanha', idReferencia: r.campanha.id_campanha, ip: req.ip });
      flash(req, 'sucesso', `Campanha "${r.campanha.nome}" apagada.`);
    } else {
      flash(req, 'erro', MSG[r.motivo] || 'Não foi possível apagar.');
    }
    res.redirect('/admin/campanhas');
  } catch (err) {
    next(err);
  }
}

module.exports = { getLista, postCriar, getDetalhe, postEditar, postEncerrar, postApagar };
