'use strict';

/**
 * Middlewares de autenticação, autorização e contexto de view.
 */

// Disponibiliza o usuário logado e as mensagens flash para TODAS as views.
function contexto(req, res, next) {
  res.locals.usuario = req.session.usuario || null;
  res.locals.caminhoAtual = req.path;
  if (req.session.flash) {
    res.locals.sucesso = req.session.flash.sucesso;
    res.locals.erro = req.session.flash.erro;
    delete req.session.flash;
  }
  next();
}

// Exige usuário autenticado; senão manda para o login.
function exigeAutenticacao(req, res, next) {
  if (req.session.usuario) return next();
  req.session.flash = { erro: 'Faça login para continuar.' };
  return res.redirect('/login');
}

// Exige perfil ADMINISTRADOR.
function exigeAdmin(req, res, next) {
  if (req.session.usuario && req.session.usuario.tipo_usuario === 'ADMINISTRADOR') return next();
  return res.status(403).render('erros/403', { titulo: 'Acesso negado' });
}

// Se a senha for provisória, força a troca antes de usar o sistema.
function exigeSenhaDefinitiva(req, res, next) {
  if (req.session.usuario && req.session.usuario.senha_provisoria) {
    return res.redirect('/trocar-senha');
  }
  return next();
}

// Bloqueia o ADMIN de áreas de jogo/social (Mural, chat, perfil).
// O admin é um acesso só para criar campanhas e sortear.
function bloquearAdmin(req, res, next) {
  if (req.session.usuario && req.session.usuario.tipo_usuario === 'ADMINISTRADOR') {
    return res.redirect('/admin');
  }
  return next();
}

// Para páginas de visitante (login/registro): se já está logado, vai para o painel.
function somenteVisitante(req, res, next) {
  if (req.session.usuario) {
    const destino = req.session.usuario.tipo_usuario === 'ADMINISTRADOR' ? '/admin' : '/feed';
    return res.redirect(destino);
  }
  return next();
}

module.exports = { contexto, exigeAutenticacao, exigeAdmin, exigeSenhaDefinitiva, bloquearAdmin, somenteVisitante };
