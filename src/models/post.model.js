'use strict';

/**
 * Acesso ao banco do Mural: posts, curtidas e comentários.
 */
const db = require('../config/db');

const SELECT_POST = `
  SELECT p.id_post, p.texto, p.imagem, p.video, p.criado_em,
         u.id_usuario, u.nome, u.usuario, u.foto_perfil,
         (SELECT COUNT(*) FROM post_curtidas c WHERE c.id_post = p.id_post)::int AS curtidas,
         (SELECT COUNT(*) FROM post_comentarios m WHERE m.id_post = p.id_post)::int AS comentarios,
         (SELECT COUNT(*) FROM reposts r WHERE r.id_post = p.id_post)::int AS reposts,
         EXISTS(SELECT 1 FROM post_curtidas c WHERE c.id_post = p.id_post AND c.id_usuario = $1) AS curtiu,
         EXISTS(SELECT 1 FROM reposts r WHERE r.id_post = p.id_post AND r.id_usuario = $1) AS repostou
    FROM posts p
    JOIN usuarios u ON u.id_usuario = p.id_usuario`;

async function criar({ idUsuario, texto, imagem, video = null }) {
  const res = await db.query(
    `INSERT INTO posts (id_usuario, texto, imagem, video) VALUES ($1, $2, $3, $4) RETURNING id_post`,
    [idUsuario, texto, imagem, video]
  );
  return res.rows[0];
}

async function listarFeed(idUsuarioAtual, limite = 50) {
  const res = await db.query(`${SELECT_POST} ORDER BY p.criado_em DESC LIMIT $2`, [idUsuarioAtual, limite]);
  return res.rows;
}

async function listarPorUsuario(idAutor, idUsuarioAtual) {
  const res = await db.query(
    `${SELECT_POST} WHERE p.id_usuario = $2 ORDER BY p.criado_em DESC`,
    [idUsuarioAtual, idAutor]
  );
  return res.rows;
}

// Posts que "idAutor" repostou (ordenados pela data do repost).
async function listarRepostadosPor(idAutor, idUsuarioAtual) {
  const res = await db.query(
    `${SELECT_POST}
       JOIN reposts rp ON rp.id_post = p.id_post AND rp.id_usuario = $2
      ORDER BY rp.criado_em DESC`,
    [idUsuarioAtual, idAutor]
  );
  return res.rows;
}

async function buscarPorId(idPost) {
  const res = await db.query(`SELECT id_post, id_usuario, imagem FROM posts WHERE id_post = $1`, [idPost]);
  return res.rows[0] || null;
}

// Post completo (com autor + contagens + curtiu) para a página individual.
async function buscarFeedUm(idPost, idUsuarioAtual) {
  const res = await db.query(`${SELECT_POST} WHERE p.id_post = $2`, [idUsuarioAtual, idPost]);
  return res.rows[0] || null;
}

async function remover(idPost) {
  await db.query(`DELETE FROM posts WHERE id_post = $1`, [idPost]);
}

// ---------- Curtidas ----------
async function curtir(idPost, idUsuario) {
  await db.query(
    `INSERT INTO post_curtidas (id_post, id_usuario) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [idPost, idUsuario]
  );
}
async function descurtir(idPost, idUsuario) {
  await db.query(`DELETE FROM post_curtidas WHERE id_post = $1 AND id_usuario = $2`, [idPost, idUsuario]);
}
async function jaCurtiu(idPost, idUsuario) {
  const res = await db.query(`SELECT 1 FROM post_curtidas WHERE id_post = $1 AND id_usuario = $2`, [idPost, idUsuario]);
  return res.rowCount > 0;
}
async function contarCurtidas(idPost) {
  const res = await db.query(`SELECT COUNT(*)::int AS n FROM post_curtidas WHERE id_post = $1`, [idPost]);
  return res.rows[0].n;
}

// ---------- Reposts ----------
async function repostar(idPost, idUsuario) {
  await db.query(`INSERT INTO reposts (id_post, id_usuario) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [idPost, idUsuario]);
}
async function desfazerRepost(idPost, idUsuario) {
  await db.query(`DELETE FROM reposts WHERE id_post = $1 AND id_usuario = $2`, [idPost, idUsuario]);
}
async function jaRepostou(idPost, idUsuario) {
  const res = await db.query(`SELECT 1 FROM reposts WHERE id_post = $1 AND id_usuario = $2`, [idPost, idUsuario]);
  return res.rowCount > 0;
}
async function contarReposts(idPost) {
  const res = await db.query(`SELECT COUNT(*)::int AS n FROM reposts WHERE id_post = $1`, [idPost]);
  return res.rows[0].n;
}

// ---------- Comentários ----------
async function adicionarComentario(idPost, idUsuario, texto) {
  const res = await db.query(
    `INSERT INTO post_comentarios (id_post, id_usuario, texto) VALUES ($1, $2, $3) RETURNING id_comentario`,
    [idPost, idUsuario, texto]
  );
  return res.rows[0];
}
async function listarComentarios(idPost) {
  const res = await db.query(
    `SELECT m.id_comentario, m.texto, m.criado_em, m.id_usuario, u.nome, u.usuario, u.foto_perfil
       FROM post_comentarios m JOIN usuarios u ON u.id_usuario = m.id_usuario
      WHERE m.id_post = $1 ORDER BY m.criado_em ASC`,
    [idPost]
  );
  return res.rows;
}
async function listarComentariosDeVarios(ids) {
  if (!ids || !ids.length) return [];
  const res = await db.query(
    `SELECT m.id_comentario, m.id_post, m.texto, m.criado_em, m.id_usuario, u.nome, u.usuario, u.foto_perfil
       FROM post_comentarios m JOIN usuarios u ON u.id_usuario = m.id_usuario
      WHERE m.id_post = ANY($1) ORDER BY m.criado_em ASC`,
    [ids]
  );
  return res.rows;
}

async function buscarComentario(idComentario) {
  const res = await db.query(`SELECT id_comentario, id_usuario, id_post FROM post_comentarios WHERE id_comentario = $1`, [idComentario]);
  return res.rows[0] || null;
}
async function removerComentario(idComentario) {
  await db.query(`DELETE FROM post_comentarios WHERE id_comentario = $1`, [idComentario]);
}

module.exports = {
  criar, listarFeed, listarPorUsuario, listarRepostadosPor, buscarPorId, buscarFeedUm, remover,
  curtir, descurtir, jaCurtiu, contarCurtidas,
  repostar, desfazerRepost, jaRepostou, contarReposts,
  adicionarComentario, listarComentarios, listarComentariosDeVarios, buscarComentario, removerComentario,
};
