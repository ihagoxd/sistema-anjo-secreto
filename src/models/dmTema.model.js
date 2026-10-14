'use strict';

/**
 * Tema de cada conversa do Direct (par de usuários). Guardado uma vez por par,
 * com o menor id primeiro — vale para os dois lados.
 */
const db = require('../config/db');

function par(a, b) {
  a = Number(a); b = Number(b);
  return a < b ? [a, b] : [b, a];
}

async function buscar(a, b) {
  const [m, M] = par(a, b);
  const res = await db.query(`SELECT tema FROM dm_temas WHERE usuario_a = $1 AND usuario_b = $2`, [m, M]);
  return res.rows[0] ? res.rows[0].tema : 'padrao';
}

async function salvar(a, b, tema, definidoPor) {
  const [m, M] = par(a, b);
  await db.query(
    `INSERT INTO dm_temas (usuario_a, usuario_b, tema, definido_por)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (usuario_a, usuario_b) DO UPDATE SET tema = EXCLUDED.tema, definido_por = EXCLUDED.definido_por, atualizado_em = now()`,
    [m, M, tema, definidoPor]
  );
}

module.exports = { buscar, salvar };
