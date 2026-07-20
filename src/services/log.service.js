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

async function listarLogs(limite = 200) {
  const res = await db.query(
    `SELECT l.*, u.nome AS nome_usuario
       FROM logs_sistema l
       LEFT JOIN usuarios u ON u.id_usuario = l.id_usuario
      ORDER BY l.criado_em DESC
      LIMIT $1`,
    [limite]
  );
  return res.rows;
}

module.exports = { registrarLog, listarLogs };
