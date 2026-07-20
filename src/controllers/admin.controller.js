'use strict';

const usuarioService = require('../services/usuario.service');
const campanhaService = require('../services/campanha.service');
const sorteioService = require('../services/sorteio.service');
const { registrarLog, listarLogs } = require('../services/log.service');

async function getDashboard(req, res, next) {
  try {
    const [pendentes, totalUsuarios, totalCampanhas, campanhaAtiva, logs] = await Promise.all([
      usuarioService.contarPendentes(),
      usuarioService.contarTotal(),
      campanhaService.contarTotal(),
      campanhaService.buscarCampanhaAtiva(),
      listarLogs(6),
    ]);
    res.render('admin/dashboard', { titulo: 'Painel', pendentes, totalUsuarios, totalCampanhas, campanhaAtiva, logs });
  } catch (err) {
    next(err);
  }
}

async function getAprovacoes(req, res, next) {
  try {
    const pendentes = await usuarioService.listarPendentes();
    res.render('admin/aprovacoes', { titulo: 'Aprovações', pendentes });
  } catch (err) {
    next(err);
  }
}

async function postAprovar(req, res, next) {
  try {
    const r = await usuarioService.aprovarCadastro(req.params.id_usuario);
    if (r.ok) {
      await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'CADASTRO_APROVADO', descricao: `usuario: ${r.usuario.usuario}`, entidade: 'usuario', idReferencia: r.usuario.id_usuario, ip: req.ip });
      req.session.flash = { sucesso: `Cadastro de "${r.usuario.nome}" aprovado.` };
    } else {
      req.session.flash = { erro: 'Cadastro não pôde ser aprovado.' };
    }
    res.redirect('/admin/aprovacoes');
  } catch (err) {
    next(err);
  }
}

async function postRecusar(req, res, next) {
  try {
    const r = await usuarioService.recusarCadastro(req.params.id_usuario);
    if (r.ok) {
      await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'CADASTRO_RECUSADO', descricao: `usuario: ${r.usuario.usuario}`, entidade: 'usuario', idReferencia: r.usuario.id_usuario, ip: req.ip });
      req.session.flash = { sucesso: `Cadastro de "${r.usuario.nome}" recusado.` };
    } else {
      req.session.flash = { erro: 'Cadastro não pôde ser recusado.' };
    }
    res.redirect('/admin/aprovacoes');
  } catch (err) {
    next(err);
  }
}

// ---------- Logs (auditoria) ----------
async function getLogs(req, res, next) {
  try {
    const logs = await listarLogs(300);
    res.render('admin/logs', { titulo: 'Logs do sistema', logs });
  } catch (err) {
    next(err);
  }
}

// ---------- Tela emergencial: revelar o sorteio ----------
// GET mostra o aviso/confirmação; POST revela os pares e REGISTRA LOG obrigatório.
async function getRevelar(req, res, next) {
  try {
    const campanha = await campanhaService.buscarCampanhaPorId(req.params.id_campanha);
    if (!campanha) {
      req.session.flash = { erro: 'Campanha não encontrada.' };
      return res.redirect('/admin/campanhas');
    }
    const realizado = await sorteioService.verificarSorteioRealizado(campanha.id_campanha);
    res.render('admin/revelarConfirma', { titulo: 'Revelar sorteio', campanha, realizado });
  } catch (err) {
    next(err);
  }
}

async function postRevelar(req, res, next) {
  try {
    const campanha = await campanhaService.buscarCampanhaPorId(req.params.id_campanha);
    if (!campanha) {
      req.session.flash = { erro: 'Campanha não encontrada.' };
      return res.redirect('/admin/campanhas');
    }
    const pares = await sorteioService.listarPares(campanha.id_campanha);
    // Registro OBRIGATÓRIO: quem revelou, quando e qual campanha.
    await registrarLog({
      idUsuario: req.session.usuario.id_usuario,
      acao: 'SORTEIO_REVELADO',
      descricao: `Revelou os pares da campanha "${campanha.nome}"`,
      entidade: 'campanha',
      idReferencia: campanha.id_campanha,
      ip: req.ip,
    });
    res.render('admin/revelar', { titulo: 'Sorteio revelado', campanha, pares });
  } catch (err) {
    next(err);
  }
}

module.exports = { getDashboard, getAprovacoes, postAprovar, postRecusar, getLogs, getRevelar, postRevelar };
