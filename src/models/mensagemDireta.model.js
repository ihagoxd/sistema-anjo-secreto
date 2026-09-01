'use strict';

/**
 * Acesso ao banco para "mensagens_diretas" (Direct do escritório).
 * Conversa 1:1 com nome (não anônima), entre quaisquer usuários aprovados.
 */
const db = require('../config/db');

async function inserir({ idRemetente, idDestinatario, texto, imagem = null, audio = null, video = null, story = null }) {
  const res = await db.query(
    `INSERT INTO mensagens_diretas (id_remetente, id_destinatario, texto, imagem, audio, video, story_ref, story_autor, story_tipo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id_mensagem, criado_em`,
    [idRemetente, idDestinatario, texto, imagem, audio, video,
      story ? story.ref : null, story ? story.autor : null, story ? story.tipo : null]
  );
  return res.rows[0];
}

// Todas as mensagens entre dois usuários, em ordem cronológica.
async function listarConversa(idA, idB) {
  const res = await db.query(
    `SELECT id_mensagem, id_remetente, id_destinatario, texto, imagem, audio, video, lida, editado_em, apagada_em, criado_em,
            story_ref, story_autor, story_tipo
       FROM mensagens_diretas
      WHERE (id_remetente = $1 AND id_destinatario = $2)
         OR (id_remetente = $2 AND id_destinatario = $1)
      ORDER BY criado_em ASC`,
    [idA, idB]
  );
  return res.rows;
}

// Marca como lidas as mensagens recebidas de "idOutro" para "idUsuario".
async function marcarLidas(idUsuario, idOutro) {
  await db.query(
    `UPDATE mensagens_diretas SET lida = TRUE
      WHERE id_destinatario = $1 AND id_remetente = $2 AND lida = FALSE`,
    [idUsuario, idOutro]
  );
}

async function buscarPorId(idMensagem) {
  const res = await db.query(
    `SELECT id_mensagem, id_remetente, id_destinatario, texto, editado_em, criado_em
       FROM mensagens_diretas WHERE id_mensagem = $1`,
    [idMensagem]
  );
  return res.rows[0] || null;
}

// Edita uma mensagem que EU enviei (apagadas não voltam). Retorna a linha atualizada ou null.
async function editar(idMensagem, idRemetente, texto) {
  const res = await db.query(
    `UPDATE mensagens_diretas
        SET texto = $3, editado_em = now()
      WHERE id_mensagem = $1 AND id_remetente = $2 AND apagada_em IS NULL
      RETURNING id_mensagem, texto, editado_em`,
    [idMensagem, idRemetente, texto]
  );
  return res.rows[0] || null;
}

// Apaga PARA TODOS uma mensagem que EU enviei: zera o conteúdo e marca apagada.
// Retorna os caminhos de mídia antigos (para tirar do disco) ou null se não é minha.
async function apagar(idMensagem, idRemetente) {
  const res = await db.query(
    `UPDATE mensagens_diretas m
        SET texto = NULL, imagem = NULL, audio = NULL, video = NULL, apagada_em = now()
       FROM (SELECT id_mensagem, imagem, audio, video FROM mensagens_diretas
              WHERE id_mensagem = $1 AND id_remetente = $2 AND apagada_em IS NULL) antiga
      WHERE m.id_mensagem = antiga.id_mensagem
      RETURNING antiga.imagem, antiga.audio, antiga.video`,
    [idMensagem, idRemetente]
  );
  return res.rows[0] || null;
}

// Última mensagem trocada com cada contato (para a lista de conversas).
// Retorna: [{ outro, texto, criado_em, minha }]
async function ultimaPorContato(idUsuario) {
  const res = await db.query(
    `SELECT DISTINCT ON (outro) outro, texto, criado_em, minha
       FROM (
         SELECT
           CASE WHEN id_remetente = $1 THEN id_destinatario ELSE id_remetente END AS outro,
           texto, criado_em, (id_remetente = $1) AS minha
           FROM mensagens_diretas
          WHERE id_remetente = $1 OR id_destinatario = $1
       ) t
      ORDER BY outro, criado_em DESC`,
    [idUsuario]
  );
  return res.rows;
}

// Quantas não lidas recebidas de cada contato: [{ outro, n }]
async function naoLidasPorContato(idUsuario) {
  const res = await db.query(
    `SELECT id_remetente AS outro, COUNT(*)::int AS n
       FROM mensagens_diretas
      WHERE id_destinatario = $1 AND lida = FALSE
      GROUP BY id_remetente`,
    [idUsuario]
  );
  return res.rows;
}

// Total de DMs não lidas (badge de navegação).
async function contarNaoLidasTotal(idUsuario) {
  const res = await db.query(
    `SELECT COUNT(*)::int AS n FROM mensagens_diretas WHERE id_destinatario = $1 AND lida = FALSE`,
    [idUsuario]
  );
  return res.rows[0].n;
}

module.exports = {
  inserir,
  listarConversa,
  marcarLidas,
  buscarPorId,
  editar,
  apagar,
  ultimaPorContato,
  naoLidasPorContato,
  contarNaoLidasTotal,
};
