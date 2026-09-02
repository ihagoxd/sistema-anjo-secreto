'use strict';

/**
 * Variáveis de ambiente da aplicação (porta, sessão, segurança, seed do admin).
 * A configuração do banco fica em src/config/db.js (variáveis DB_*).
 */
require('dotenv').config();
const { fuso } = require('./fuso'); // fixa o fuso (America/Sao_Paulo) antes de qualquer Date

const SESSION_SECRET_PADRAO = 'troque-este-segredo-em-desenvolvimento';

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  fuso,

  // Sessão
  sessionSecret: process.env.SESSION_SECRET || SESSION_SECRET_PADRAO,

  // Segurança / autenticação
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
  loginMaxTentativas: parseInt(process.env.LOGIN_MAX_TENTATIVAS, 10) || 5,

  // Admin inicial (usado pelo seed — src/db/seed.js)
  adminInicialNome: process.env.ADMIN_INICIAL_NOME || 'Administrador',
  adminInicialUsuario: process.env.ADMIN_INICIAL_USUARIO || 'admin',
  adminInicialSenha: process.env.ADMIN_INICIAL_SENHA || null,
};

env.isProducao = env.nodeEnv === 'production';

// Em produção, exija segredos fortes: nunca suba com o SESSION_SECRET padrão.
if (env.isProducao && (!process.env.SESSION_SECRET || env.sessionSecret === SESSION_SECRET_PADRAO)) {
  throw new Error(
    'SESSION_SECRET não configurado (ou usando o valor padrão). ' +
    'Defina um segredo forte e único no ambiente antes de rodar em produção.'
  );
}

// Se a aplicação é servida por HTTPS. Controla o cookie "secure", o HSTS e o
// upgrade-insecure-requests (CSP). Padrão: segue NODE_ENV, mas pode ser desligado
// com SERVIR_HTTPS=false para rodar em HTTP interno (LAN) sem quebrar login/CSS.
env.servirHttps = process.env.SERVIR_HTTPS != null
  ? ['true', '1', 'require'].includes(String(process.env.SERVIR_HTTPS).toLowerCase())
  : env.isProducao;

module.exports = env;
