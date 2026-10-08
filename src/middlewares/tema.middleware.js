'use strict';

/**
 * Põe o tema ativo da rede social em res.locals.tema para TODA página (inclusive
 * login): o layout lê daqui a classe do <body>, a folha de estilo extra, o
 * slogan e a decoração. Cacheado no serviço — custa quase nada por requisição.
 */
const temaService = require('../services/tema.service');

async function carregarTema(req, res, next) {
  if (req.method !== 'GET') return next();
  try {
    res.locals.tema = await temaService.ativo();
  } catch (err) {
    // Banco indisponível: segue no tema padrão para a página (ou o /health) responder.
    console.error('[tema] não foi possível ler o tema ativo:', err.message);
    res.locals.tema = temaService.padrao();
  }
  next();
}

module.exports = { carregarTema };
