'use strict';

/**
 * Acesso ao banco para "notificacoes".
 */
const db = require('../config/db');

const SELECT = `
  SELECT n.id_notificacao, n.tipo, n.id_ator, n.link, n.ref, n.lida, n.criado_em,
         a.nome AS ator_nome, a.usuario AS ator_usuario, a.foto_perfil AS ator_foto
    FROM notificacoes n
    LEFT JOIN usuarios a ON a.id_usuario = n.id_ator`;

async function inserir({ idUsuario, tipo, idAtor = null, link = null, ref = null }) {
  const res = await db.query(
    `INSERT INTO notificacoes (id_usuario, tipo, id_ator, link, ref)
     VALUES ($1, $2, $3, $4, $5) RETURNING id_notificacao`,
    [idUsuario, tipo, idAtor, link, ref]
  );
  return res.rows[0];
}

async function listar(idUsuario, limite = 30) {
  const res = await db.query(
    `${SELECT} WHERE n.id_usuario = $1 ORDER BY n.criado_em DESC LIMIT $2`,
    [idUsuario, limite]
  );
  return res.rows;
}

async function contarNaoLidas(idUsuario) {
  const res = await db.query(
    `SELECT COUNT(*)::int AS n FROM notificacoes WHERE id_usuario = $1 AND lida = FALSE`,
    [idUsuario]
  );
  return res.rows[0].n;
}

async function marcarLida(idNotificacao, idUsuario) {
  const res = await db.query(
    `UPDATE notificacoes SET lida = TRUE WHERE id_notificacao = $1 AND id_usuario = $2
     RETURNING link`,
    [idNotificacao, idUsuario]
  );
  return res.rows[0] || null;
}

async function marcarTodasLidas(idUsuario) {
  await db.query(`UPDATE notificacoes SET lida = TRUE WHERE id_usuario = $1 AND lida = FALSE`, [idUsuario]);
}

// Já existe uma notificação deste tipo, deste ator, criada HOJE para este usuário?
// (evita duplicar aniversário no mesmo dia)
async function existeHoje(idUsuario, tipo, idAtor) {
  const res = await db.query(
    `SELECT 1 FROM notificacoes
      WHERE id_usuario = $1 AND tipo = $2 AND id_ator IS NOT DISTINCT FROM $3
        AND criado_em::date = CURRENT_DATE
      LIMIT 1`,
    [idUsuario, tipo, idAtor]
  );
  return res.rows.length > 0;
}

module.exports = { inserir, listar, contarNaoLidas, marcarLida, marcarTodasLidas, existeHoje };
