'use strict';

/**
 * Regras de gestão de usuários pelo administrador:
 * aprovar/recusar cadastros e o CRUD completo (criar, editar, ativar/inativar, resetar senha).
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const usuarioModel = require('../models/usuario.model');
const { normalizarUsuario, usuarioValido, SENHA_MIN } = require('./auth.service');

const TIPOS = ['ADMINISTRADOR', 'PARTICIPANTE'];

// ---------- Listagem / contagens ----------
function listarUsuarios(busca) {
  return usuarioModel.listarTodos({ busca });
}
function listarPendentes() {
  return usuarioModel.listarPorStatus('PENDENTE');
}
function contarPendentes() {
  return usuarioModel.contarPorStatus('PENDENTE');
}
function contarTotal() {
  return usuarioModel.contarTotal();
}

// ---------- Aprovação de cadastros ----------
async function aprovarCadastro(idUsuario) {
  const u = await usuarioModel.buscarPorId(idUsuario);
  if (!u) return { ok: false, motivo: 'NAO_ENCONTRADO' };
  if (u.status !== 'PENDENTE') return { ok: false, motivo: 'NAO_PENDENTE' };
  await usuarioModel.atualizarStatus(idUsuario, 'APROVADO');
  return { ok: true, usuario: u };
}

async function recusarCadastro(idUsuario) {
  const u = await usuarioModel.buscarPorId(idUsuario);
  if (!u) return { ok: false, motivo: 'NAO_ENCONTRADO' };
  if (u.status !== 'PENDENTE') return { ok: false, motivo: 'NAO_PENDENTE' };
  await usuarioModel.atualizarStatus(idUsuario, 'RECUSADO');
  return { ok: true, usuario: u };
}

// ---------- CRUD ----------
function validarDados({ nome, usuario, tipoUsuario }) {
  const nomeLimpo = String(nome || '').trim();
  const login = normalizarUsuario(usuario);
  if (nomeLimpo.length < 2) return { erro: 'NOME' };
  if (!usuarioValido(login)) return { erro: 'USUARIO_INVALIDO' };
  if (!TIPOS.includes(tipoUsuario)) return { erro: 'TIPO_INVALIDO' };
  return { nome: nomeLimpo, usuario: login, tipoUsuario };
}

async function criarUsuario({ nome, usuario, senha, tipoUsuario }) {
  const v = validarDados({ nome, usuario, tipoUsuario });
  if (v.erro) return { ok: false, motivo: v.erro };
  if (String(senha || '').length < SENHA_MIN) return { ok: false, motivo: 'SENHA_CURTA' };

  const senhaHash = await bcrypt.hash(String(senha), env.bcryptRounds);
  try {
    const novo = await usuarioModel.criar({ nome: v.nome, usuario: v.usuario, senhaHash, tipoUsuario: v.tipoUsuario });
    return { ok: true, usuario: novo };
  } catch (err) {
    if (err.code === '23505') return { ok: false, motivo: 'USUARIO_EXISTE' };
    throw err;
  }
}

async function editarUsuario(idUsuario, { nome, usuario, tipoUsuario }, idAtor) {
  const alvo = await usuarioModel.buscarPorId(idUsuario);
  if (!alvo) return { ok: false, motivo: 'NAO_ENCONTRADO' };

  const v = validarDados({ nome, usuario, tipoUsuario });
  if (v.erro) return { ok: false, motivo: v.erro };

  // Anti-lockout: não rebaixar o último admin ativo, nem rebaixar a si mesmo.
  const rebaixandoAdmin = alvo.tipo_usuario === 'ADMINISTRADOR' && v.tipoUsuario !== 'ADMINISTRADOR';
  if (rebaixandoAdmin) {
    if (Number(idAtor) === Number(idUsuario)) return { ok: false, motivo: 'SELF_REBAIXAR' };
    if (alvo.ativo && (await usuarioModel.contarAdminsAtivos()) <= 1) return { ok: false, motivo: 'ULTIMO_ADMIN' };
  }

  try {
    const atualizado = await usuarioModel.atualizar(idUsuario, v);
    return { ok: true, usuario: atualizado, rebaixouSelf: Number(idAtor) === Number(idUsuario) && rebaixandoAdmin };
  } catch (err) {
    if (err.code === '23505') return { ok: false, motivo: 'USUARIO_EXISTE' };
    throw err;
  }
}

async function inativarUsuario(idUsuario, idAtor) {
  const alvo = await usuarioModel.buscarPorId(idUsuario);
  if (!alvo) return { ok: false, motivo: 'NAO_ENCONTRADO' };
  if (Number(idAtor) === Number(idUsuario)) return { ok: false, motivo: 'SELF' };
  if (alvo.tipo_usuario === 'ADMINISTRADOR' && alvo.ativo && (await usuarioModel.contarAdminsAtivos()) <= 1) {
    return { ok: false, motivo: 'ULTIMO_ADMIN' };
  }
  await usuarioModel.definirAtivo(idUsuario, false);
  return { ok: true, usuario: alvo };
}

async function ativarUsuario(idUsuario) {
  const alvo = await usuarioModel.buscarPorId(idUsuario);
  if (!alvo) return { ok: false, motivo: 'NAO_ENCONTRADO' };
  await usuarioModel.definirAtivo(idUsuario, true);
  return { ok: true, usuario: alvo };
}

// Exclusão DEFINITIVA (hard delete). Protege contra: excluir a si mesmo,
// excluir o último admin ativo e excluir quem está numa campanha em andamento.
async function excluirUsuario(idUsuario, idAtor) {
  const alvo = await usuarioModel.buscarPorId(idUsuario);
  if (!alvo) return { ok: false, motivo: 'NAO_ENCONTRADO' };
  if (Number(idAtor) === Number(idUsuario)) return { ok: false, motivo: 'SELF_EXCLUIR' };
  if (alvo.tipo_usuario === 'ADMINISTRADOR' && alvo.ativo && (await usuarioModel.contarAdminsAtivos()) <= 1) {
    return { ok: false, motivo: 'ULTIMO_ADMIN' };
  }
  if (await usuarioModel.participaDeCampanhaAtiva(idUsuario)) {
    return { ok: false, motivo: 'EM_CAMPANHA_ATIVA' };
  }
  await usuarioModel.excluir(idUsuario);
  return { ok: true, usuario: alvo };
}

// Gera uma senha provisória legível (sem caracteres ambíguos).
function gerarSenhaProvisoria(tamanho = 8) {
  const alfabeto = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(tamanho);
  let s = '';
  for (let i = 0; i < tamanho; i++) s += alfabeto[bytes[i] % alfabeto.length];
  return s;
}

async function resetarSenha(idUsuario) {
  const alvo = await usuarioModel.buscarPorId(idUsuario);
  if (!alvo) return { ok: false, motivo: 'NAO_ENCONTRADO' };
  const senhaProvisoria = gerarSenhaProvisoria();
  const senhaHash = await bcrypt.hash(senhaProvisoria, env.bcryptRounds);
  await usuarioModel.resetarSenha(idUsuario, senhaHash);
  return { ok: true, usuario: alvo, senhaProvisoria };
}

module.exports = {
  listarUsuarios,
  listarPendentes,
  contarPendentes,
  contarTotal,
  aprovarCadastro,
  recusarCadastro,
  criarUsuario,
  editarUsuario,
  inativarUsuario,
  ativarUsuario,
  excluirUsuario,
  resetarSenha,
};
