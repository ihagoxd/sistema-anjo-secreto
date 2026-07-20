'use strict';

/**
 * Regras de negócio das campanhas (rodada mensal do Anjo Secreto).
 * Status: RASCUNHO -> EM_ANDAMENTO (após o sorteio) -> ENCERRADA.
 */
const campanhaModel = require('../models/campanha.model');

function nomeValido(nome) {
  return String(nome || '').trim().length >= 2;
}

async function criarCampanha({ nome, descricao }) {
  if (!nomeValido(nome)) return { ok: false, motivo: 'NOME' };
  const nova = await campanhaModel.criar({
    nome: String(nome).trim(),
    descricao: descricao ? String(descricao).trim() : null,
  });
  return { ok: true, campanha: nova };
}

async function editarCampanha(idCampanha, { nome, descricao }) {
  const c = await campanhaModel.buscarPorId(idCampanha);
  if (!c) return { ok: false, motivo: 'NAO_ENCONTRADA' };
  if (c.status === 'ENCERRADA') return { ok: false, motivo: 'ENCERRADA' };
  if (!nomeValido(nome)) return { ok: false, motivo: 'NOME' };
  const atualizada = await campanhaModel.atualizar(idCampanha, {
    nome: String(nome).trim(),
    descricao: descricao ? String(descricao).trim() : null,
  });
  return { ok: true, campanha: atualizada };
}

async function encerrarCampanha(idCampanha) {
  const c = await campanhaModel.buscarPorId(idCampanha);
  if (!c) return { ok: false, motivo: 'NAO_ENCONTRADA' };
  if (c.status === 'ENCERRADA') return { ok: false, motivo: 'JA_ENCERRADA' };
  const encerrada = await campanhaModel.atualizarStatus(idCampanha, 'ENCERRADA', true);
  return { ok: true, campanha: encerrada };
}

async function apagarCampanha(idCampanha) {
  const c = await campanhaModel.buscarPorId(idCampanha);
  if (!c) return { ok: false, motivo: 'NAO_ENCONTRADA' };
  const removida = await campanhaModel.remover(idCampanha);
  return { ok: true, campanha: removida };
}

function listarCampanhas() {
  return campanhaModel.listarTodas();
}

function buscarCampanhaPorId(idCampanha) {
  return campanhaModel.buscarPorId(idCampanha);
}

function buscarCampanhaAtiva() {
  return campanhaModel.buscarAtiva();
}

function contarTotal() {
  return campanhaModel.contarTotal();
}

function contarParticipantes(idCampanha) {
  return campanhaModel.contarParticipantes(idCampanha);
}

module.exports = {
  criarCampanha,
  editarCampanha,
  encerrarCampanha,
  apagarCampanha,
  listarCampanhas,
  buscarCampanhaPorId,
  buscarCampanhaAtiva,
  contarTotal,
  contarParticipantes,
};
