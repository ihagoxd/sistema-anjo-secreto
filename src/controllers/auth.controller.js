'use strict';

const authService = require('../services/auth.service');
const { registrarLog } = require('../services/log.service');
const usuarioModel = require('../models/usuario.model');
const tempoReal = require('../services/tempoReal.service');
const { renderizar, ehFetch } = require('../utils/responder');

const MSG_LOGIN = {
  CREDENCIAIS: 'Usuário ou senha inválidos.',
  PENDENTE: 'Seu cadastro está aguardando aprovação do administrador.',
  RECUSADO: 'Seu cadastro não foi aprovado. Procure o administrador.',
  INATIVO: 'Seu acesso está inativo. Procure o administrador.',
};

const MSG_REGISTRO = {
  NOME: 'Informe seu nome completo.',
  USUARIO_INVALIDO: 'Usuário inválido: use de 3 a 80 caracteres (letras, números, ponto, hífen ou _).',
  SENHA_CURTA: `A senha deve ter ao menos ${authService.SENHA_MIN} caracteres.`,
  SENHA_DIFERENTE: 'As senhas não conferem.',
  USUARIO_EXISTE: 'Esse usuário já está em uso. Escolha outro.',
};
// Qual campo a tela fluida marca em vermelho para cada erro
const CAMPO_DO_ERRO = { NOME: 'nome', USUARIO_INVALIDO: 'usuario', USUARIO_EXISTE: 'usuario', SENHA_CURTA: 'senha', SENHA_DIFERENTE: 'confirmarSenha' };

// Participante entra direto no FEED (nunca no painel, que mostra o protegido —
// alguém do lado poderia ver). O painel fica a um toque, quando a pessoa quiser.
function destinoDoUsuario(u) {
  if (u.senha_provisoria) return '/trocar-senha';
  return u.tipo_usuario === 'ADMINISTRADOR' ? '/admin' : '/feed';
}

function guardarNaSessao(req, u) {
  req.session.usuario = {
    id_usuario: u.id_usuario,
    nome: u.nome,
    usuario: u.usuario,
    tipo_usuario: u.tipo_usuario,
    senha_provisoria: u.senha_provisoria,
    foto_perfil: u.foto_perfil || null,
    perfil_completo: !!u.perfil_completo,
    tutorial_visto: !!u.tutorial_visto_em,
  };
}

// ---------- LOGIN ----------
function getLogin(req, res) {
  // ?u= vem do "Ir para o login" depois do cadastro: o usuário já chega preenchido
  const usuario = req.query.u ? String(req.query.u).slice(0, 80) : undefined;
  res.render('auth/login', { layout: 'auth', titulo: 'Entrar', usuario });
}

async function postLogin(req, res, next) {
  try {
    const { usuario, senha } = req.body;
    const r = await authService.validarLogin(usuario, senha);
    if (!r.ok) {
      await registrarLog({ acao: 'LOGIN_FALHA', descricao: `login: ${usuario} (${r.motivo})`, ip: req.ip });
      // Tela fluida: o erro aparece no próprio cartão, sem recarregar (e sem apagar o que foi digitado)
      if (ehFetch(req)) return res.status(401).json({ ok: false, erro: MSG_LOGIN[r.motivo] || 'Não foi possível entrar.', campo: r.motivo === 'CREDENCIAIS' ? 'senha' : 'usuario' });
      return res.status(401).render('auth/login', {
        layout: 'auth', titulo: 'Entrar', usuario, erro: MSG_LOGIN[r.motivo] || 'Não foi possível entrar.',
      });
    }
    guardarNaSessao(req, r.usuario);
    await registrarLog({ idUsuario: r.usuario.id_usuario, acao: 'LOGIN_SUCESSO', ip: req.ip });
    if (ehFetch(req)) return res.json({ ok: true, redirect: destinoDoUsuario(r.usuario) });
    return res.redirect(destinoDoUsuario(r.usuario));
  } catch (err) {
    next(err);
  }
}

// ---------- REGISTRO ----------
function getRegistrar(req, res) {
  res.render('auth/registrar', { layout: 'auth', titulo: 'Criar conta' });
}

async function postRegistrar(req, res, next) {
  try {
    const { nome, usuario, senha, confirmarSenha } = req.body;
    const r = await authService.registrar({ nome, usuario, senha, confirmarSenha });
    if (!r.ok) {
      if (ehFetch(req)) return res.status(400).json({ ok: false, erro: MSG_REGISTRO[r.motivo] || 'Não foi possível concluir o cadastro.', campo: CAMPO_DO_ERRO[r.motivo] || null });
      return res.status(400).render('auth/registrar', {
        layout: 'auth', titulo: 'Criar conta', nome, usuario,
        erro: MSG_REGISTRO[r.motivo] || 'Não foi possível concluir o cadastro.',
      });
    }
    await registrarLog({ idUsuario: r.usuario.id_usuario, acao: 'CADASTRO_SOLICITADO', descricao: `usuario: ${r.usuario.usuario}`, ip: req.ip });
    // Painel dos admins conectados: o número de Aprovações sobe e a pessoa entra na lista na hora
    try {
      const [admins, resumo] = await Promise.all([usuarioModel.idsAdminsAtivos(), usuarioModel.contarResumo()]);
      if (admins.length) {
        const html = await renderizar(res, 'partials/admUsuario', { ...r.usuario, sit: 'pendente', sitRotulo: 'Aguardando aprovação', csrfToken: '' });
        admins.forEach((id) => tempoReal.publicar(id, 'adm-cadastro', { nome: r.usuario.nome, id_usuario: r.usuario.id_usuario, html, resumo }));
      }
    } catch (e) { /* o aviso ao vivo é um extra: o cadastro já foi feito */ }
    // Tela fluida: o cartão vira "Cadastro enviado" ali mesmo, com o login da pessoa
    if (ehFetch(req)) return res.json({ ok: true, usuario: r.usuario.usuario, nome: r.usuario.nome });
    req.session.flash = { sucesso: 'Cadastro enviado! Aguarde a aprovação do administrador para entrar.' };
    return res.redirect('/login');
  } catch (err) {
    next(err);
  }
}

// Cadastro: o campo de login confere na hora se o usuário está livre
async function getUsuarioLivre(req, res, next) {
  try {
    const u = authService.normalizarUsuario(req.query.u);
    if (!authService.usuarioValido(u)) return res.json({ ok: true, valido: false, livre: false });
    const existe = await usuarioModel.buscarPorUsuario(u);
    res.json({ ok: true, valido: true, livre: !existe });
  } catch (err) {
    next(err);
  }
}

// ---------- TROCAR SENHA ----------
function getTrocarSenha(req, res) {
  res.render('auth/trocarSenha', { layout: 'auth', titulo: 'Definir nova senha' });
}

async function postTrocarSenha(req, res, next) {
  try {
    const { senha, confirmarSenha } = req.body;
    const r = await authService.trocarSenha(req.session.usuario.id_usuario, senha, confirmarSenha);
    if (!r.ok) {
      if (ehFetch(req)) return res.status(400).json({ ok: false, erro: MSG_REGISTRO[r.motivo] || 'Não foi possível trocar a senha.', campo: CAMPO_DO_ERRO[r.motivo] || null });
      return res.status(400).render('auth/trocarSenha', {
        layout: 'auth', titulo: 'Definir nova senha',
        erro: MSG_REGISTRO[r.motivo] || 'Não foi possível trocar a senha.',
      });
    }
    req.session.usuario.senha_provisoria = false;
    await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'SENHA_TROCADA', ip: req.ip });
    req.session.flash = { sucesso: 'Senha atualizada com sucesso.' };
    const destino = req.session.usuario.tipo_usuario === 'ADMINISTRADOR' ? '/admin' : '/feed';
    if (ehFetch(req)) return res.json({ ok: true, redirect: destino });
    return res.redirect(destino);
  } catch (err) {
    next(err);
  }
}

// ---------- LOGOUT ----------
function postLogout(req, res) {
  req.session.destroy(() => res.redirect('/login'));
}

module.exports = {
  getLogin, postLogin,
  getRegistrar, postRegistrar, getUsuarioLivre,
  getTrocarSenha, postTrocarSenha,
  postLogout,
};
