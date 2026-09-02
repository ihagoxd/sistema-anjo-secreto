'use strict';

/**
 * Fuso horário do sistema inteiro.
 *
 * O servidor de produção roda em UTC; sem isto, toda hora exibida (chat,
 * notificações, logs) e todo "hoje" calculado (humor do dia, aniversários,
 * contagem diária) sairiam 3 h adiantados. Definimos o fuso ANTES de qualquer
 * uso de Date — o Node relê process.env.TZ na atribuição — e o mesmo valor é
 * enviado ao PostgreSQL (CURRENT_DATE, ::date) em src/config/db.js.
 *
 * Pode ser trocado pela variável de ambiente TZ (ex.: TZ=America/Manaus).
 */
require('dotenv').config();

const FUSO_PADRAO = 'America/Sao_Paulo';

const fuso = process.env.TZ || FUSO_PADRAO;
process.env.TZ = fuso;

module.exports = { fuso };
