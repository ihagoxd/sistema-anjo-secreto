'use strict';

const sorteioService = require('../services/sorteio.service');
const { registrarLog } = require('../services/log.service');

const MSG = {
  NAO_ENCONTRADA: 'Campanha não encontrada.',
  JA_SORTEADA: 'O sorteio desta campanha já foi realizado.',
  NAO_SORTEADA: 'Esta campanha ainda não tem sorteio para refazer.',
  OUTRA_ATIVA: 'Já existe uma campanha em andamento. Encerre-a antes de sortear esta.',
  POUCOS: `É preciso no mínimo ${sorteioService.MIN_PARTICIPANTES} participantes ativos.`,
};

function flash(req, tipo, msg) {
  req.session.flash = { [tipo]: msg };
}

async function postIniciar(req, res, next) {
  try {
    const idCampanha = req.params.id_campanha;
    const r = await sorteioService.iniciarSorteio(idCampanha);
    if (r.ok) {
      await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'SORTEIO_INICIADO', descricao: `${r.total} pares`, entidade: 'campanha', idReferencia: Number(idCampanha), ip: req.ip });
      flash(req, 'sucesso', `Sorteio realizado! ${r.total} anjos foram definidos. A campanha está em andamento.`);
    } else {
      flash(req, 'erro', MSG[r.motivo] || 'Não foi possível sortear.');
    }
    res.redirect(`/admin/campanhas/${idCampanha}`);
  } catch (err) {
    next(err);
  }
}

async function postRefazer(req, res, next) {
  try {
    const idCampanha = req.params.id_campanha;
    const r = await sorteioService.refazerSorteio(idCampanha);
    if (r.ok) {
      await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'SORTEIO_REFEITO', descricao: `${r.total} pares`, entidade: 'campanha', idReferencia: Number(idCampanha), ip: req.ip });
      flash(req, 'sucesso', 'Sorteio refeito. As mensagens anteriores foram arquivadas.');
    } else {
      flash(req, 'erro', MSG[r.motivo] || 'Não foi possível refazer o sorteio.');
    }
    res.redirect(`/admin/campanhas/${idCampanha}`);
  } catch (err) {
    next(err);
  }
}

module.exports = { postIniciar, postRefazer };
