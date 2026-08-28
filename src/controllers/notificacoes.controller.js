'use strict';

const notificacaoService = require('../services/notificacao.service');

// Página completa de notificações (marca todas como lidas ao abrir).
async function getPagina(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const brutas = await notificacaoService.listar(me, 60);
    await notificacaoService.marcarTodasLidas(me);
    // Agrupa notificações consecutivas idênticas (mesmo texto/autor) para não poluir a lista:
    // "Seu anjo te mandou uma mensagem 8×" em vez de oito linhas repetidas.
    const itens = [];
    for (const n of brutas) {
      const ult = itens[itens.length - 1];
      if (ult && ult.texto === n.texto && ult.ator_nome === n.ator_nome && ult.emoji === n.emoji) {
        ult.vezes = (ult.vezes || 1) + 1;
        ult.lida = ult.lida && n.lida;
      } else {
        itens.push(Object.assign({}, n));
      }
    }
    res.render('notificacoes/index', { titulo: 'Notificações', itens });
  } catch (err) {
    next(err);
  }
}

// Abre uma notificação: marca como lida e leva ao destino.
async function abrir(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const r = await notificacaoService.marcarLida(Number(req.params.id), me);
    res.redirect(r && r.link ? r.link : '/notificacoes');
  } catch (err) {
    next(err);
  }
}

// Polling: notificações mais novas que "ultima" + contagem de não lidas (AJAX → JSON).
async function novas(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const ultima = Number(req.query.ultima) || 0;
    const [count, itens] = await Promise.all([
      notificacaoService.contarNaoLidas(me),
      notificacaoService.listar(me, 8),
    ]);
    const novas = itens.filter((n) => n.id > ultima);
    res.json({ count, ultima: itens[0] ? itens[0].id : ultima, novas });
  } catch (err) {
    next(err);
  }
}

// Marca todas como lidas (AJAX ou form).
async function lerTodas(req, res, next) {
  try {
    await notificacaoService.marcarTodasLidas(req.session.usuario.id_usuario);
    if ((req.get('x-requested-with') || '') === 'fetch') return res.json({ ok: true });
    res.redirect(req.get('Referer') || '/notificacoes');
  } catch (err) {
    next(err);
  }
}

module.exports = { getPagina, abrir, lerTodas, novas };
