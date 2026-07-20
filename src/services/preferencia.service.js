'use strict';

/**
 * Regras das preferências do usuário (incluindo foto de perfil e galeria de fotos).
 * - O próprio usuário edita as suas.
 * - O anjo pode ver as do seu protegido (derivado do sorteio).
 */
const preferenciaModel = require('../models/preferencia.model');
const usuarioModel = require('../models/usuario.model');
const sorteioService = require('./sorteio.service');
const { apagarUpload } = require('../config/upload');

const MAX_FOTOS = 12;

function limpar(valor) {
  const v = String(valor == null ? '' : valor).trim();
  return v.length ? v : null;
}

function buscarPreferenciasPorUsuario(idUsuario) {
  return preferenciaModel.buscarPorUsuario(idUsuario);
}

function listarFotos(idUsuario) {
  return preferenciaModel.listarFotos(idUsuario);
}

async function salvarPreferencias(idUsuario, dados) {
  const limpos = {};
  for (const campo of preferenciaModel.CAMPOS) limpos[campo] = limpar(dados[campo]);
  const salvo = await preferenciaModel.salvar(idUsuario, limpos);
  return { ok: true, preferencias: salvo };
}

// Adiciona fotos à galeria (respeitando o limite total). Sobras são apagadas.
async function adicionarFotos(idUsuario, caminhos) {
  if (!caminhos || !caminhos.length) return { adicionadas: 0, ignoradas: 0 };
  const atual = await preferenciaModel.contarFotos(idUsuario);
  const vagas = Math.max(0, MAX_FOTOS - atual);
  const entram = caminhos.slice(0, vagas);
  const sobram = caminhos.slice(vagas);
  for (const c of entram) await preferenciaModel.adicionarFoto(idUsuario, c);
  sobram.forEach((c) => apagarUpload(c));
  return { adicionadas: entram.length, ignoradas: sobram.length };
}

async function removerFoto(idFoto, idUsuario) {
  const foto = await preferenciaModel.buscarFoto(idFoto, idUsuario);
  if (!foto) return { ok: false };
  await preferenciaModel.removerFoto(idFoto, idUsuario);
  apagarUpload(foto.caminho);
  return { ok: true };
}

// Salva a legenda de uma foto ("o que é essa foto").
async function salvarLegenda(idFoto, idUsuario, legenda) {
  const l = limpar(legenda);
  await preferenciaModel.atualizarLegenda(idFoto, idUsuario, l ? l.slice(0, 120) : null);
  return { ok: true };
}

// Preferências + foto + galeria do protegido (só o anjo enxerga).
async function buscarPreferenciasDoProtegido(idCampanha, idUsuarioAnjo) {
  const ref = await sorteioService.buscarProtegidoDoAnjo(idCampanha, idUsuarioAnjo);
  if (!ref) return null;
  const [protegido, preferencias, fotos] = await Promise.all([
    usuarioModel.buscarPorId(ref.id_usuario),
    preferenciaModel.buscarPorUsuario(ref.id_usuario),
    preferenciaModel.listarFotos(ref.id_usuario),
  ]);
  return { protegido, preferencias, fotos };
}

module.exports = {
  MAX_FOTOS,
  buscarPreferenciasPorUsuario,
  listarFotos,
  salvarPreferencias,
  adicionarFotos,
  removerFoto,
  salvarLegenda,
  buscarPreferenciasDoProtegido,
};
