'use strict';

/**
 * Acesso ao banco dos Stories (foto/vídeo que expira em 24 h, estilo Instagram).
 */
const db = require('../config/db');

const ATIVO = `s.criado_em > now() - interval '24 hours'`;

async function criar(idUsuario, imagem, video) {
  const res = await db.query(
    `INSERT INTO stories (id_usuario, imagem, video) VALUES ($1, $2, $3) RETURNING id_story`,
    [idUsuario, imagem || null, video || null]
  );
  return res.rows[0].id_story;
}

async function buscarPorId(idStory) {
  const res = await db.query(`SELECT * FROM stories WHERE id_story = $1`, [idStory]);
  return res.rows[0] || null;
}

// Todos os stories ativos (24 h) de participantes aprovados/ativos, com autor,
// se EU já vi cada um e quantas pessoas viram (para o autor ver "Visto por N").
async function listarAtivos(meId) {
  const res = await db.query(
    `SELECT s.id_story, s.id_usuario, s.imagem, s.video, s.criado_em,
            u.nome, u.usuario, u.foto_perfil,
            EXISTS(SELECT 1 FROM story_vistos v WHERE v.id_story = s.id_story AND v.id_usuario = $1) AS visto,
            (SELECT COUNT(*) FROM story_vistos v WHERE v.id_story = s.id_story AND v.id_usuario <> s.id_usuario)::int AS vistos
       FROM stories s
       JOIN usuarios u ON u.id_usuario = s.id_usuario
      WHERE ${ATIVO} AND u.status = 'APROVADO' AND u.ativo = TRUE
      ORDER BY s.id_usuario, s.criado_em ASC`,
    [meId]
  );
  return res.rows;
}

// Resumo por usuário para pintar os anéis do feed: tem story? já vi todos?
async function resumoAneis(meId) {
  const res = await db.query(
    `SELECT s.id_usuario,
            bool_and(v.id_usuario IS NOT NULL) AS tudo_visto
       FROM stories s
       LEFT JOIN story_vistos v ON v.id_story = s.id_story AND v.id_usuario = $1
      WHERE ${ATIVO}
      GROUP BY s.id_usuario`,
    [meId]
  );
  const mapa = {};
  res.rows.forEach((r) => { mapa[r.id_usuario] = { tem: true, tudoVisto: r.tudo_visto }; });
  return mapa;
}

async function marcarVisto(idStory, idUsuario) {
  await db.query(
    `INSERT INTO story_vistos (id_story, id_usuario) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [idStory, idUsuario]
  );
}

async function remover(idStory) {
  await db.query(`DELETE FROM stories WHERE id_story = $1`, [idStory]);
}

// Apaga stories expirados e devolve as mídias para tirar do disco.
async function removerExpirados() {
  const res = await db.query(
    `DELETE FROM stories WHERE criado_em <= now() - interval '24 hours' RETURNING imagem, video`
  );
  return res.rows;
}

module.exports = { criar, buscarPorId, listarAtivos, resumoAneis, marcarVisto, remover, removerExpirados };
