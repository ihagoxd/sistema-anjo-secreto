'use strict';

const authService = require('../services/auth.service');
const { registrarLog } = require('../services/log.service');

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
  };
}

// ---------- LOGIN ----------
function getLogin(req, res) {
  res.render('auth/login', { layout: 'auth', titulo: 'Entrar' });
}

async function postLogin(req, res, next) {
  try {
    const { usuario, senha } = req.body;
    const r = await authService.validarLogin(usuario, senha);
    if (!r.ok) {
      await registrarLog({ acao: 'LOGIN_FALHA', descricao: `login: ${usuario} (${r.motivo})`, ip: req.ip });
      return res.status(401).render('auth/login', {
        layout: 'auth', titulo: 'Entrar', usuario, erro: MSG_LOGIN[r.motivo] || 'Não foi possível entrar.',
      });
    }
    guardarNaSessao(req, r.usuario);
    await registrarLog({ idUsuario: r.usuario.id_usuario, acao: 'LOGIN_SUCESSO', ip: req.ip });
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
      return res.status(400).render('auth/registrar', {
        layout: 'auth', titulo: 'Criar conta', nome, usuario,
        erro: MSG_REGISTRO[r.motivo] || 'Não foi possível concluir o cadastro.',
      });
    }
    await registrarLog({ idUsuario: r.usuario.id_usuario, acao: 'CADASTRO_SOLICITADO', descricao: `usuario: ${r.usuario.usuario}`, ip: req.ip });
    req.session.flash = { sucesso: 'Cadastro enviado! Aguarde a aprovação do administrador para entrar.' };
    return res.redirect('/login');
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
      return res.status(400).render('auth/trocarSenha', {
        layout: 'auth', titulo: 'Definir nova senha',
        erro: MSG_REGISTRO[r.motivo] || 'Não foi possível trocar a senha.',
      });
    }
    req.session.usuario.senha_provisoria = false;
    await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'SENHA_TROCADA', ip: req.ip });
    req.session.flash = { sucesso: 'Senha atualizada com sucesso.' };
    return res.redirect(req.session.usuario.tipo_usuario === 'ADMINISTRADOR' ? '/admin' : '/feed');
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
  getRegistrar, postRegistrar,
  getTrocarSenha, postTrocarSenha,
  postLogout,
};
