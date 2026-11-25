'use strict';

/**
 * Destaques do perfil (stories guardados em coleções, como no Instagram).
 */
const db = require('../config/db');

// Destaques de uma pessoa, com a capa (foto mais recente; se só houver vídeo, o vídeo) e o total
async function listarDoUsuario(idUsuario) {
  const res = await db.query(
    `SELECT d.id_destaque, d.titulo,
            (SELECT s.imagem FROM destaque_stories ds JOIN stories s ON s.id_story = ds.id_story
              WHERE ds.id_destaque = d.id_destaque AND s.imagem IS NOT NULL ORDER BY s.criado_em DESC LIMIT 1) AS capa,
            (SELECT s.video FROM destaque_stories ds JOIN stories s ON s.id_story = ds.id_story
              WHERE ds.id_destaque = d.id_destaque AND s.video IS NOT NULL ORDER BY s.criado_em DESC LIMIT 1) AS capa_video,
            (SELECT COUNT(*) FROM destaque_stories ds WHERE ds.id_destaque = d.id_destaque)::int AS total
       FROM destaques d
      WHERE d.id_usuario = $1
        AND EXISTS (SELECT 1 FROM destaque_stories ds WHERE ds.id_destaque = d.id_destaque)
      ORDER BY d.criado_em ASC`,
    [idUsuario]
  );
  return res.rows;
}

async function buscar(idDestaque) {
  const res = await db.query(`SELECT id_destaque, id_usuario, titulo FROM destaques WHERE id_destaque = $1`, [idDestaque]);
  return res.rows[0] || null;
}

// Stories do destaque no formato do visualizador (mesmos campos do listarAtivos)
async function listarStories(idDestaque, meId) {
  const res = await db.query(
    `SELECT s.id_story, s.imagem, s.video, s.criado_em, s.sobreposicoes,
            EXISTS(SELECT 1 FROM story_vistos v WHERE v.id_story = s.id_story AND v.id_usuario = $2) AS visto,
            (SELECT COUNT(*) FROM story_vistos v WHERE v.id_story = s.id_story AND v.id_usuario <> s.id_usuario)::int AS vistos,
            EXISTS(SELECT 1 FROM story_curtidas c WHERE c.id_story = s.id_story AND c.id_usuario = $2) AS curti,
            (SELECT COUNT(*) FROM story_curtidas c WHERE c.id_story = s.id_story)::int AS curtidas
       FROM destaque_stories ds JOIN stories s ON s.id_story = ds.id_story
      WHERE ds.id_destaque = $1
      ORDER BY s.criado_em ASC`,
    [idDestaque, meId]
  );
  return res.rows;
}

async function criar(idUsuario, titulo) {
  const res = await db.query(
    `INSERT INTO destaques (id_usuario, titulo) VALUES ($1, $2) RETURNING id_destaque, titulo`,
    [idUsuario, titulo]
  );
  return res.rows[0];
}

async function adicionarStory(idDestaque, idStory) {
  await db.query(
    `INSERT INTO destaque_stories (id_destaque, id_story) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [idDestaque, idStory]
  );
  await db.query(`UPDATE destaques SET atualizado_em = now() WHERE id_destaque = $1`, [idDestaque]);
}

async function tirarStory(idDestaque, idStory) {
  await db.query(`DELETE FROM destaque_stories WHERE id_destaque = $1 AND id_story = $2`, [idDestaque, idStory]);
  const res = await db.query(`SELECT COUNT(*)::int AS n FROM destaque_stories WHERE id_destaque = $1`, [idDestaque]);
  return res.rows[0].n;
}

async function renomear(idDestaque, titulo) {
  await db.query(`UPDATE destaques SET titulo = $2, atualizado_em = now() WHERE id_destaque = $1`, [idDestaque, titulo]);
}

async function excluir(idDestaque) {
  await db.query(`DELETE FROM destaques WHERE id_destaque = $1`, [idDestaque]);
}

// Arquivo de stories da pessoa (últimos 30 dias + os que estão em destaques), do mais novo
async function arquivo(idUsuario) {
  const res = await db.query(
    `SELECT s.id_story, s.imagem, s.video, s.criado_em,
            (s.criado_em > now() - interval '24 hours') AS ativo
       FROM stories s
      WHERE s.id_usuario = $1
      ORDER BY s.criado_em DESC
      LIMIT 120`,
    [idUsuario]
  );
  return res.rows;
}

// Em quais destaques da pessoa este story já está (para marcar na folha "Destacar")
async function destaquesDoStory(idStory) {
  const res = await db.query(`SELECT id_destaque FROM destaque_stories WHERE id_story = $1`, [idStory]);
  return res.rows.map((r) => r.id_destaque);
}

module.exports = {
  listarDoUsuario, buscar, listarStories, criar, adicionarStory, tirarStory, renomear, excluir, arquivo, destaquesDoStory,
};
