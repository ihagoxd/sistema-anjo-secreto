'use strict';

/**
 * Grupos do Direct do escritório: grupos, membros e mensagens de grupo.
 * Leitura por "lida_ate" (id da última mensagem que a pessoa viu): contar as
 * não lidas fica barato e não precisa de uma linha por leitor.
 */
const db = require('../config/db');

const SEL_MSG = `m.id_mensagem, m.id_grupo, m.id_remetente, m.texto, m.imagem, m.audio, m.video, m.sistema,
            m.respondendo_a, m.editado_em, m.apagada_em, m.criado_em,
            u.nome AS remetente_nome, u.usuario AS remetente_usuario, u.foto_perfil AS remetente_foto`;

// Cria o grupo com quem criou (admin) + convidados, tudo numa transação.
async function criar(nome, criadoPor, ids) {
  const cli = await db.getClient();
  try {
    await cli.query('BEGIN');
    const g = await cli.query('INSERT INTO grupos (nome, criado_por) VALUES ($1, $2) RETURNING id_grupo', [nome, criadoPor]);
    const idGrupo = g.rows[0].id_grupo;
    await cli.query('INSERT INTO grupo_membros (id_grupo, id_usuario, admin) VALUES ($1, $2, TRUE)', [idGrupo, criadoPor]);
    for (const id of ids) {
      await cli.query('INSERT INTO grupo_membros (id_grupo, id_usuario) VALUES ($1, $2) ON CONFLICT DO NOTHING', [idGrupo, id]);
    }
    await cli.query('COMMIT');
    return idGrupo;
  } catch (e) {
    await cli.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    cli.release();
  }
}

async function buscar(idGrupo) {
  const res = await db.query(
    `SELECT g.*, (SELECT COUNT(*)::int FROM grupo_membros WHERE id_grupo = g.id_grupo) AS membros_n
       FROM grupos g WHERE g.id_grupo = $1`,
    [idGrupo]
  );
  return res.rows[0] || null;
}

async function ehMembro(idGrupo, idUsuario) {
  const res = await db.query('SELECT 1 FROM grupo_membros WHERE id_grupo = $1 AND id_usuario = $2', [idGrupo, idUsuario]);
  return res.rowCount > 0;
}

async function membros(idGrupo) {
  const res = await db.query(
    `SELECT u.id_usuario, u.nome, u.usuario, u.foto_perfil, gm.admin, gm.entrou_em
       FROM grupo_membros gm JOIN usuarios u ON u.id_usuario = gm.id_usuario
      WHERE gm.id_grupo = $1
      ORDER BY gm.admin DESC, lower(u.nome)`,
    [idGrupo]
  );
  return res.rows;
}

async function idsMembros(idGrupo) {
  const res = await db.query('SELECT id_usuario FROM grupo_membros WHERE id_grupo = $1', [idGrupo]);
  return res.rows.map((r) => r.id_usuario);
}

// Devolve só quem de fato entrou (quem já era membro é ignorado).
async function adicionar(idGrupo, ids) {
  const novos = [];
  for (const id of ids) {
    const r = await db.query(
      'INSERT INTO grupo_membros (id_grupo, id_usuario) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id_usuario',
      [idGrupo, id]
    );
    if (r.rowCount) novos.push(id);
  }
  return novos;
}

async function remover(idGrupo, idUsuario) {
  const r = await db.query('DELETE FROM grupo_membros WHERE id_grupo = $1 AND id_usuario = $2', [idGrupo, idUsuario]);
  return r.rowCount > 0;
}

async function renomear(idGrupo, nome) {
  await db.query('UPDATE grupos SET nome = $2 WHERE id_grupo = $1', [idGrupo, nome]);
}

async function apagarGrupo(idGrupo) {
  await db.query('DELETE FROM grupos WHERE id_grupo = $1', [idGrupo]);
}

// Grupos de que a pessoa participa: última mensagem, não lidas, nº de membros e
// dois membros de amostra (para o avatar empilhado, como no Instagram).
async function listarDoUsuario(idUsuario) {
  const res = await db.query(
    `SELECT g.id_grupo, g.nome, g.foto, g.criado_em,
            (SELECT COUNT(*)::int FROM grupo_membros x WHERE x.id_grupo = g.id_grupo) AS membros_n,
            (SELECT COUNT(*)::int FROM grupo_mensagens m
              WHERE m.id_grupo = g.id_grupo AND m.id_mensagem > gm.lida_ate AND m.id_remetente IS DISTINCT FROM $1::int) AS nao_lidas,
            u.id_mensagem AS ult_id, u.texto AS ult_texto, u.imagem AS ult_imagem, u.audio AS ult_audio, u.video AS ult_video,
            u.sistema AS ult_sistema, u.apagada_em AS ult_apagada, u.criado_em AS ult_em, u.id_remetente AS ult_de, ur.nome AS ult_nome,
            (SELECT json_agg(json_build_object('nome', a.nome, 'foto', a.foto_perfil))
               FROM (SELECT us.nome, us.foto_perfil
                       FROM grupo_membros a2 JOIN usuarios us ON us.id_usuario = a2.id_usuario
                      WHERE a2.id_grupo = g.id_grupo AND a2.id_usuario <> $1
                      ORDER BY (us.foto_perfil IS NOT NULL) DESC, a2.entrou_em LIMIT 2) a) AS amostra
       FROM grupo_membros gm
       JOIN grupos g ON g.id_grupo = gm.id_grupo
       LEFT JOIN LATERAL (SELECT * FROM grupo_mensagens m WHERE m.id_grupo = g.id_grupo ORDER BY m.id_mensagem DESC LIMIT 1) u ON TRUE
       LEFT JOIN usuarios ur ON ur.id_usuario = u.id_remetente
      WHERE gm.id_usuario = $1
      ORDER BY COALESCE(u.criado_em, g.criado_em) DESC`,
    [idUsuario]
  );
  return res.rows;
}

// ---------- Mensagens ----------

async function inserirMensagem({ idGrupo, idRemetente, texto, imagem = null, audio = null, video = null, respondendoA = null, sistema = false }) {
  const res = await db.query(
    `INSERT INTO grupo_mensagens (id_grupo, id_remetente, texto, imagem, audio, video, respondendo_a, sistema)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id_mensagem, criado_em`,
    [idGrupo, idRemetente, texto, imagem, audio, video, respondendoA, sistema]
  );
  return res.rows[0];
}

async function buscarMensagem(idMensagem) {
  const res = await db.query(
    `SELECT ${SEL_MSG} FROM grupo_mensagens m LEFT JOIN usuarios u ON u.id_usuario = m.id_remetente WHERE m.id_mensagem = $1`,
    [idMensagem]
  );
  return res.rows[0] || null;
}

// Últimas N mensagens do grupo, em ordem cronológica.
async function listarMensagens(idGrupo, limite = 300) {
  const res = await db.query(
    `SELECT * FROM (
       SELECT ${SEL_MSG} FROM grupo_mensagens m LEFT JOIN usuarios u ON u.id_usuario = m.id_remetente
        WHERE m.id_grupo = $1 ORDER BY m.id_mensagem DESC LIMIT $2
     ) t ORDER BY id_mensagem ASC`,
    [idGrupo, limite]
  );
  return res.rows;
}

async function marcarLidas(idGrupo, idUsuario) {
  await db.query(
    `UPDATE grupo_membros
        SET lida_ate = GREATEST(lida_ate, (SELECT COALESCE(MAX(id_mensagem), 0) FROM grupo_mensagens WHERE id_grupo = $1))
      WHERE id_grupo = $1 AND id_usuario = $2`,
    [idGrupo, idUsuario]
  );
}

async function editar(idMensagem, idRemetente, texto) {
  const res = await db.query(
    `UPDATE grupo_mensagens SET texto = $3, editado_em = now()
      WHERE id_mensagem = $1 AND id_remetente = $2 AND apagada_em IS NULL AND sistema = FALSE
      RETURNING id_mensagem, texto, editado_em`,
    [idMensagem, idRemetente, texto]
  );
  return res.rows[0] || null;
}

async function apagar(idMensagem, idRemetente) {
  const res = await db.query(
    `UPDATE grupo_mensagens m
        SET texto = NULL, imagem = NULL, audio = NULL, video = NULL, apagada_em = now()
       FROM (SELECT id_mensagem, imagem, audio, video FROM grupo_mensagens
              WHERE id_mensagem = $1 AND id_remetente = $2 AND apagada_em IS NULL AND sistema = FALSE) antiga
      WHERE m.id_mensagem = antiga.id_mensagem
      RETURNING antiga.imagem, antiga.audio, antiga.video`,
    [idMensagem, idRemetente]
  );
  return res.rows[0] || null;
}

async function contarNaoLidasTotal(idUsuario) {
  const res = await db.query(
    `SELECT COALESCE(SUM((SELECT COUNT(*) FROM grupo_mensagens m
                           WHERE m.id_grupo = gm.id_grupo AND m.id_mensagem > gm.lida_ate
                             AND m.id_remetente IS DISTINCT FROM $1::int)), 0)::int AS n
       FROM grupo_membros gm WHERE gm.id_usuario = $1`,
    [idUsuario]
  );
  return res.rows[0].n;
}

module.exports = {
  criar, buscar, ehMembro, membros, idsMembros, adicionar, remover, renomear, apagarGrupo, listarDoUsuario,
  inserirMensagem, buscarMensagem, listarMensagens, marcarLidas, editar, apagar, contarNaoLidasTotal,
};
