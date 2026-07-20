'use strict';

/**
 * Configuração da sessão (cookie + store no PostgreSQL).
 * A tabela "session" é criada automaticamente (createTableIfMissing).
 */
const session = require('express-session');
const ConnectPgSimple = require('connect-pg-simple')(session);
const { pool } = require('./db');
const env = require('./env');

const store = new ConnectPgSimple({
  pool,
  tableName: 'session',
  createTableIfMissing: true,
});

module.exports = session({
  store,
  name: 'anjo.sid',
  secret: env.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.servirHttps, // cookie só por HTTPS quando servido por HTTPS
    maxAge: 1000 * 60 * 60 * 8, // 8 horas
  },
});
