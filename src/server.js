'use strict';

/**
 * Ponto de entrada: sobe o servidor HTTP.
 */
const app = require('./app');
const env = require('./config/env');
const { pool } = require('./config/db');

const server = app.listen(env.port, () => {
  console.log(`[server] Anjo Secreto rodando em http://localhost:${env.port} (${env.nodeEnv})`);
});

// Encerramento gracioso: fecha o servidor e o pool do banco.
function encerrar(sinal) {
  console.log(`\n[server] Recebido ${sinal}, encerrando...`);
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}

process.on('SIGINT', () => encerrar('SIGINT'));
process.on('SIGTERM', () => encerrar('SIGTERM'));

module.exports = server;