'use strict';

/**
 * Regras de autenticação: login, auto-cadastro e troca de senha.
 */
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const usuarioModel = require('../models/usuario.model');

const SENHA_MIN = 6;

// Normaliza o login: sem espaços nas pontas, minúsculo, só letras/números/._-
function normalizarUsuario(valor) {
  return String(valor || '').trim().toLowerCase();
}
function usuarioValido(usuario) {
  return /^[a-z0-9._-]{3,80}$/.test(usuario);
}

/**
 * Valida credenciais de login.
 * @returns {{ ok: true, usuario: object } | { ok: false, motivo: string }}
 */
async function validarLogin(loginDigitado, senha) {
  const login = normalizarUsuario(loginDigitado);
  const u = await usuarioModel.buscarPorUsuario(login);

  // Mesmo se o usuário não existir, comparamos um hash falso para não vazar
  // (timing) se o login existe ou não.
  const hash = u ? u.senha_hash : '$2a$12$0000000000000000000000000000000000000000000000000000';
  const senhaConfere = await bcrypt.compare(String(senha || ''), hash);

  if (!u || !senhaConfere) return { ok: false, motivo: 'CREDENCIAIS' };
  if (u.status === 'PENDENTE') return { ok: false, motivo: 'PENDENTE' };
  if (u.status === 'RECUSADO') return { ok: false, motivo: 'RECUSADO' };
  if (!u.ativo) return { ok: false, motivo: 'INATIVO' };

  delete u.senha_hash;
  return { ok: true, usuario: u };
}

/**
 * Auto-cadastro (fica PENDENTE até um admin aprovar).
 * @returns {{ ok: true, usuario: object } | { ok: false, motivo: string }}
 */
async function registrar({ nome, usuario, senha, confirmarSenha }) {
  const nomeLimpo = String(nome || '').trim();
  const login = normalizarUsuario(usuario);

  if (nomeLimpo.length < 2) return { ok: false, motivo: 'NOME' };
  if (!usuarioValido(login)) return { ok: false, motivo: 'USUARIO_INVALIDO' };
  if (String(senha || '').length < SENHA_MIN) return { ok: false, motivo: 'SENHA_CURTA' };
  if (senha !== confirmarSenha) return { ok: false, motivo: 'SENHA_DIFERENTE' };

  const senhaHash = await bcrypt.hash(String(senha), env.bcryptRounds);
  try {
    const novo = await usuarioModel.criarCadastroPendente({ nome: nomeLimpo, usuario: login, senhaHash });
    return { ok: true, usuario: novo };
  } catch (err) {
    if (err.code === '23505') return { ok: false, motivo: 'USUARIO_EXISTE' }; // unique_violation
    throw err;
  }
}

async function trocarSenha(idUsuario, novaSenha, confirmarSenha) {
  if (String(novaSenha || '').length < SENHA_MIN) return { ok: false, motivo: 'SENHA_CURTA' };
  if (novaSenha !== confirmarSenha) return { ok: false, motivo: 'SENHA_DIFERENTE' };
  const senhaHash = await bcrypt.hash(String(novaSenha), env.bcryptRounds);
  await usuarioModel.atualizarSenha(idUsuario, senhaHash);
  return { ok: true };
}

module.exports = { validarLogin, registrar, trocarSenha, SENHA_MIN, normalizarUsuario, usuarioValido };
