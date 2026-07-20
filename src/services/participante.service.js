'use strict';

/**
 * Regras dos participantes da campanha.
 * Só é possível mexer enquanto a campanha está em RASCUNHO.
 */
const participanteModel = require('../models/participante.model');
const campanhaModel = require('../models/campanha.model');
const usuarioModel = require('../models/usuario.model');

function listarPorCampanha(idCampanha) {
  return participanteModel.listarPorCampanha(idCampanha);
}

function listarElegiveis(idCampanha) {
  return participanteModel.listarElegiveis(idCampanha);
}

async function adicionarParticipante(idCampanha, idUsuario) {
  const campanha = await campanhaModel.buscarPorId(idCampanha);
  if (!campanha) return { ok: false, motivo: 'CAMPANHA_NAO_ENCONTRADA' };
  if (campanha.status !== 'RASCUNHO') return { ok: false, motivo: 'NAO_RASCUNHO' };

  const usuario = await usuarioModel.buscarPorId(idUsuario);
  if (!usuario || usuario.status !== 'APROVADO' || !usuario.ativo) {
    return { ok: false, motivo: 'USUARIO_INVALIDO' };
  }

  try {
    await participanteModel.adicionar(idCampanha, idUsuario);
    return { ok: true, usuario };
  } catch (err) {
    if (err.code === '23505') return { ok: false, motivo: 'DUPLICADO' }; // unique (id_campanha, id_usuario)
    throw err;
  }
}

async function removerParticipante(idParticipante, idCampanha) {
  const campanha = await campanhaModel.buscarPorId(idCampanha);
  if (!campanha) return { ok: false, motivo: 'CAMPANHA_NAO_ENCONTRADA' };
  if (campanha.status !== 'RASCUNHO') return { ok: false, motivo: 'NAO_RASCUNHO' };

  const removido = await participanteModel.remover(idParticipante, idCampanha);
  if (!removido) return { ok: false, motivo: 'NAO_ENCONTRADO' };
  return { ok: true };
}

module.exports = { listarPorCampanha, listarElegiveis, adicionarParticipante, removerParticipante };
