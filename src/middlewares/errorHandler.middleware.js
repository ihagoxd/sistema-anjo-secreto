'use strict';

/**
 * Middlewares de tratamento de erros e de rotas não encontradas.
 * Devem ser registrados por último na cadeia do Express.
 */
const env = require('../config/env');

// 404 — nenhuma rota correspondeu
function naoEncontrado(req, res) {
  res.status(404).render('erros/404', { titulo: 'Não encontrado' });
}

// 500 — erro não tratado em qualquer ponto da aplicação
// eslint-disable-next-line no-unused-vars
function erroInterno(err, req, res, next) {
  console.error('[erro]', err.stack || err.message || err);
  res.status(err.status || 500).render('erros/500', {
    titulo: 'Erro interno',
    // Em produção não expõe detalhes do erro ao usuário.
    detalhe: env.isProducao ? null : err.message,
  });
}

module.exports = { naoEncontrado, erroInterno };