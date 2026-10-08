'use strict';

/**
 * Configurações internas do app (tabela app_config, chave → valor).
 * Ex.: tema ativo da rede social, par de chaves VAPID do push.
 */
const db = require('../config/db');

async function ler(chave) {
  const res = await db.query(`SELECT valor FROM app_config WHERE chave = $1`, [chave]);
  return res.rows[0] ? res.rows[0].valor : null;
}

async function gravar(chave, valor) {
  await db.query(
    `INSERT INTO app_config (chave, valor) VALUES ($1, $2)
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`,
    [chave, valor]
  );
}

module.exports = { ler, gravar };
