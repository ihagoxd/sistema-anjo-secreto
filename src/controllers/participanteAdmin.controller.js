'use strict';

const participanteService = require('../services/participante.service');
const { registrarLog } = require('../services/log.service');

const MSG = {
  CAMPANHA_NAO_ENCONTRADA: 'Campanha não encontrada.',
  NAO_RASCUNHO: 'Só dá para mexer nos participantes enquanto a campanha está em rascunho.',
  USUARIO_INVALIDO: 'Usuário inválido (precisa estar aprovado e ativo).',
  DUPLICADO: 'Esse usuário já é participante desta campanha.',
  NAO_ENCONTRADO: 'Participante não encontrado.',
};

function flash(req, tipo, msg) {
  req.session.flash = { [tipo]: msg };
}

async function postAdicionar(req, res, next) {
  try {
    const idCampanha = req.params.id_campanha;
    const r = await participanteService.adicionarParticipante(idCampanha, req.body.id_usuario);
    if (r.ok) {
      await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'PARTICIPANTE_ADICIONADO', descricao: r.usuario.usuario, entidade: 'campanha', idReferencia: Number(idCampanha), ip: req.ip });
      flash(req, 'sucesso', `${r.usuario.nome} entrou na campanha.`);
    } else {
      flash(req, 'erro', MSG[r.motivo] || 'Não foi possível adicionar.');
    }
    res.redirect(`/admin/campanhas/${idCampanha}`);
  } catch (err) {
    next(err);
  }
}

async function postRemover(req, res, next) {
  try {
    const idCampanha = req.params.id_campanha;
    const r = await participanteService.removerParticipante(req.params.id_participante, idCampanha);
    if (r.ok) {
      await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'PARTICIPANTE_REMOVIDO', entidade: 'campanha', idReferencia: Number(idCampanha), ip: req.ip });
      flash(req, 'sucesso', 'Participante removido.');
    } else {
      flash(req, 'erro', MSG[r.motivo] || 'Não foi possível remover.');
    }
    res.redirect(`/admin/campanhas/${idCampanha}`);
  } catch (err) {
    next(err);
  }
}

module.exports = { postAdicionar, postRemover };
