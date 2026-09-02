'use strict';

/**
 * Acesso ao banco dos Stories (foto/vídeo que expira em 24 h, estilo Instagram).
 */
const db = require('../config/db');

const ATIVO = `s.criado_em > now() - interval '24 hours'`;

async function criar(idUsuario, imagem, video, mencao = null) {
  const res = await db.query(
    `INSERT INTO stories (id_usuario, imagem, video, mencao) VALUES ($1, $2, $3, $4) RETURNING id_story`,
    [idUsuario, imagem || null, video || null, mencao]
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
            (SELECT COUNT(*) FROM story_vistos v WHERE v.id_story = s.id_story AND v.id_usuario <> s.id_usuario)::int AS vistos,
            EXISTS(SELECT 1 FROM story_curtidas c WHERE c.id_story = s.id_story AND c.id_usuario = $1) AS curti,
            (SELECT COUNT(*) FROM story_curtidas c WHERE c.id_story = s.id_story)::int AS curtidas
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
            bool_and(v.id_usuario IS NOT NULL) AS tudo_visto,
            MAX(s.criado_em) AS ultimo
       FROM stories s
       LEFT JOIN story_vistos v ON v.id_story = s.id_story AND v.id_usuario = $1
      WHERE ${ATIVO}
      GROUP BY s.id_usuario`,
    [meId]
  );
  const mapa = {};
  res.rows.forEach((r) => { mapa[r.id_usuario] = { tem: true, tudoVisto: r.tudo_visto, ultimo: r.ultimo }; });
  return mapa;
}

// ---------- Menções ----------
async function adicionarMencao(idStory, idUsuario) {
  await db.query(
    `INSERT INTO story_mencoes (id_story, id_usuario) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [idStory, idUsuario]
  );
}
async function foiMencionado(idStory, idUsuario) {
  const res = await db.query(
    `SELECT 1 FROM story_mencoes WHERE id_story = $1 AND id_usuario = $2
     UNION SELECT 1 FROM stories WHERE id_story = $1 AND mencao = $2 LIMIT 1`,
    [idStory, idUsuario]
  );
  return res.rowCount > 0;
}

// ---------- Curtidas de story ----------
async function curtir(idStory, idUsuario) {
  await db.query(
    `INSERT INTO story_curtidas (id_story, id_usuario) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [idStory, idUsuario]
  );
}
async function descurtir(idStory, idUsuario) {
  await db.query(`DELETE FROM story_curtidas WHERE id_story = $1 AND id_usuario = $2`, [idStory, idUsuario]);
}
async function jaCurtiu(idStory, idUsuario) {
  const res = await db.query(`SELECT 1 FROM story_curtidas WHERE id_story = $1 AND id_usuario = $2`, [idStory, idUsuario]);
  return res.rowCount > 0;
}
async function contarCurtidas(idStory) {
  const res = await db.query(`SELECT COUNT(*)::int AS n FROM story_curtidas WHERE id_story = $1`, [idStory]);
  return res.rows[0].n;
}

// Quem viu o story (para o AUTOR): quem curtiu vem primeiro, com flag do coração.
async function listarViram(idStory) {
  const res = await db.query(
    `SELECT u.id_usuario, u.nome, u.usuario, u.foto_perfil, v.visto_em,
            EXISTS(SELECT 1 FROM story_curtidas c WHERE c.id_story = v.id_story AND c.id_usuario = v.id_usuario) AS curtiu
       FROM story_vistos v
       JOIN usuarios u ON u.id_usuario = v.id_usuario
      WHERE v.id_story = $1
        AND v.id_usuario <> (SELECT s.id_usuario FROM stories s WHERE s.id_story = $1)
      ORDER BY curtiu DESC, v.visto_em DESC`,
    [idStory]
  );
  return res.rows;
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

module.exports = {
  criar, buscarPorId, listarAtivos, resumoAneis, marcarVisto, remover, removerExpirados, listarViram,
  adicionarMencao, foiMencionado,
  curtir, descurtir, jaCurtiu, contarCurtidas,
};
