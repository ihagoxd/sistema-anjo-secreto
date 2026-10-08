'use strict';

/**
 * Preferências POR TEMA (tabela preferencias_tema): uma linha por usuário e tema,
 * com os campos em JSONB. Ex.: no Mês das Crianças, a lista de presentes que a
 * pessoa quer ganhar. Os campos de cada tema vivem em config/temas.js.
 */
const db = require('../config/db');

async function buscar(idUsuario, tema) {
  const res = await db.query(
    `SELECT dados, atualizado_em FROM preferencias_tema WHERE id_usuario = $1 AND tema = $2`,
    [idUsuario, tema]
  );
  return res.rows[0] || null;
}

// Upsert dos dados (objeto já limpo pelo serviço).
async function salvar(idUsuario, tema, dados) {
  const res = await db.query(
    `INSERT INTO preferencias_tema (id_usuario, tema, dados)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (id_usuario, tema) DO UPDATE SET dados = EXCLUDED.dados
     RETURNING dados, atualizado_em`,
    [idUsuario, tema, JSON.stringify(dados || {})]
  );
  return res.rows[0];
}

// Quantas pessoas já preencheram algo neste tema (painel do admin).
async function contarPreenchidos(tema) {
  const res = await db.query(
    `SELECT COUNT(*)::int AS n
       FROM preferencias_tema p
       JOIN usuarios u ON u.id_usuario = p.id_usuario
      WHERE p.tema = $1 AND p.dados <> '{}'::jsonb
        AND u.status = 'APROVADO' AND u.ativo = TRUE AND u.tipo_usuario = 'PARTICIPANTE'`,
    [tema]
  );
  return res.rows[0].n;
}

module.exports = { buscar, salvar, contarPreenchidos };
