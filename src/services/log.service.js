'use strict';

/**
 * Registro de ações sensíveis (auditoria).
 * Nunca deve derrubar a operação principal — em caso de erro, apenas loga no console.
 */
const db = require('../config/db');

async function registrarLog({ idUsuario = null, acao, descricao = null, entidade = null, idReferencia = null, ip = null }) {
  try {
    await db.query(
      `INSERT INTO logs_sistema (id_usuario, acao, descricao, entidade, id_referencia, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [idUsuario, acao, descricao, entidade, idReferencia, ip]
    );
  } catch (err) {
    console.error('[log] Falha ao registrar log:', err.message);
  }
}

// Lista os logs mais recentes. Aceita um número (limite) ou opções com filtros:
//   { limite, offset, acao, q }  — q procura na descrição, no nome ou no login de quem fez.
async function listarLogs(opcoes = 200) {
  const o = typeof opcoes === 'number' ? { limite: opcoes } : (opcoes || {});
  const limite = Math.min(Math.max(parseInt(o.limite, 10) || 200, 1), 500);
  const offset = Math.max(parseInt(o.offset, 10) || 0, 0);
  const acao = o.acao ? String(o.acao).trim().toUpperCase() : null;
  const termo = o.q && String(o.q).trim() ? `%${String(o.q).trim()}%` : null;
  const res = await db.query(
    `SELECT l.*, u.nome AS nome_usuario, u.usuario AS login_usuario,
            COUNT(*) OVER()::int AS total
       FROM logs_sistema l
       LEFT JOIN usuarios u ON u.id_usuario = l.id_usuario
      WHERE ($1::text IS NULL OR l.acao = $1)
        AND ($2::text IS NULL OR l.descricao ILIKE $2 OR u.nome ILIKE $2 OR u.usuario ILIKE $2 OR l.ip ILIKE $2)
      ORDER BY l.criado_em DESC
      LIMIT $3 OFFSET $4`,
    [acao, termo, limite, offset]
  );
  return res.rows;
}

// Ações que já apareceram nos logs (para o filtro), com a contagem de cada uma.
async function listarAcoes() {
  const res = await db.query(
    `SELECT acao, COUNT(*)::int AS n FROM logs_sistema GROUP BY acao ORDER BY acao ASC`
  );
  return res.rows;
}

module.exports = { registrarLog, listarLogs, listarAcoes };
