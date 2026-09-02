'use strict';

/**
 * Acesso ao banco para "avisos" (cards da administração) e "avisos_vistos".
 */
const db = require('../config/db');

const COLUNAS = `a.id_aviso, a.titulo, a.mensagem, a.emoji, a.tema, a.link, a.link_texto,
                 a.ativo, a.expira_em, a.criado_por, a.criado_em, a.atualizado_em`;

async function criar({ titulo, mensagem, emoji, tema, link, linkTexto, ativo, expiraEm, criadoPor }) {
  const res = await db.query(
    `INSERT INTO avisos (titulo, mensagem, emoji, tema, link, link_texto, ativo, expira_em, criado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id_aviso`,
    [titulo, mensagem, emoji, tema, link, linkTexto, ativo, expiraEm, criadoPor]
  );
  return res.rows[0];
}

async function atualizar(idAviso, { titulo, mensagem, emoji, tema, link, linkTexto, ativo, expiraEm }) {
  const res = await db.query(
    `UPDATE avisos
        SET titulo = $2, mensagem = $3, emoji = $4, tema = $5, link = $6, link_texto = $7, ativo = $8, expira_em = $9
      WHERE id_aviso = $1
      RETURNING id_aviso`,
    [idAviso, titulo, mensagem, emoji, tema, link, linkTexto, ativo, expiraEm]
  );
  return res.rows[0] || null;
}

async function buscarPorId(idAviso) {
  const res = await db.query(`SELECT ${COLUNAS} FROM avisos a WHERE a.id_aviso = $1`, [idAviso]);
  return res.rows[0] || null;
}

// Lista para o admin: com quantos viram e quantos deveriam ver.
async function listar() {
  const res = await db.query(
    `SELECT ${COLUNAS},
            u.nome AS autor_nome,
            (SELECT COUNT(*)::int FROM avisos_vistos v WHERE v.id_aviso = a.id_aviso) AS vistos,
            (SELECT COUNT(*)::int FROM usuarios x WHERE x.status = 'APROVADO' AND x.ativo = TRUE
                AND x.id_usuario IS DISTINCT FROM a.criado_por) AS destinatarios,
            (a.expira_em IS NOT NULL AND a.expira_em < now()) AS expirado
       FROM avisos a
       LEFT JOIN usuarios u ON u.id_usuario = a.criado_por
      ORDER BY a.criado_em DESC`
  );
  return res.rows;
}

async function alternarAtivo(idAviso) {
  const res = await db.query(
    `UPDATE avisos SET ativo = NOT ativo WHERE id_aviso = $1 RETURNING ativo`,
    [idAviso]
  );
  return res.rows[0] || null;
}

async function excluir(idAviso) {
  const res = await db.query(`DELETE FROM avisos WHERE id_aviso = $1`, [idAviso]);
  return res.rowCount;
}

// Avisos que este usuário ainda precisa ver (ativos, não expirados, não vistos, não criados por ele).
async function pendentesPara(idUsuario, limite = 3) {
  const res = await db.query(
    `SELECT ${COLUNAS}
       FROM avisos a
      WHERE a.ativo = TRUE
        AND (a.expira_em IS NULL OR a.expira_em > now())
        AND a.criado_por IS DISTINCT FROM $1
        AND NOT EXISTS (SELECT 1 FROM avisos_vistos v WHERE v.id_aviso = a.id_aviso AND v.id_usuario = $1)
      ORDER BY a.criado_em DESC
      LIMIT $2`,
    [idUsuario, limite]
  );
  return res.rows;
}

async function marcarVisto(idAviso, idUsuario) {
  await db.query(
    `INSERT INTO avisos_vistos (id_aviso, id_usuario) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [idAviso, idUsuario]
  );
}

// "Mostrar de novo para todo mundo": zera os vistos.
async function limparVistos(idAviso) {
  await db.query(`DELETE FROM avisos_vistos WHERE id_aviso = $1`, [idAviso]);
}

// Quem deve ser avisado quando um aviso é publicado.
async function idsDestinatarios(excetoId = null) {
  const res = await db.query(
    `SELECT id_usuario FROM usuarios
      WHERE status = 'APROVADO' AND ativo = TRUE AND ($1::int IS NULL OR id_usuario <> $1)`,
    [excetoId]
  );
  return res.rows.map((r) => r.id_usuario);
}

module.exports = { criar, atualizar, buscarPorId, listar, alternarAtivo, excluir, pendentesPara, marcarVisto, limparVistos, idsDestinatarios };
