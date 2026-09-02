'use strict';

/**
 * Acesso ao banco para "notificacoes", preferências de notificação,
 * inscrições de push e configurações internas (chaves VAPID).
 */
const db = require('../config/db');

const SELECT = `
  SELECT n.id_notificacao, n.tipo, n.id_ator, n.link, n.ref, n.lida, n.criado_em,
         n.detalhe, n.imagem,
         a.nome AS ator_nome, a.usuario AS ator_usuario, a.foto_perfil AS ator_foto
    FROM notificacoes n
    LEFT JOIN usuarios a ON a.id_usuario = n.id_ator`;

// Filtros da página/painel: cada um cobre um conjunto de tipos.
const CATEGORIAS = {
  mensagens: ['MENSAGEM', 'MENSAGEM_ANJO', 'MENSAGEM_PROTEGIDO'],
  social: ['CURTIDA', 'COMENTARIO', 'REPOST', 'MENCAO'],
  aniversario: ['ANIVERSARIO', 'ANIVERSARIO_SEU'],
  sistema: ['SORTEIO', 'TESTE'],
};

async function inserir({ idUsuario, tipo, idAtor = null, link = null, ref = null, detalhe = null, imagem = null }) {
  const res = await db.query(
    `INSERT INTO notificacoes (id_usuario, tipo, id_ator, link, ref, detalhe, imagem)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id_notificacao`,
    [idUsuario, tipo, idAtor, link, ref, detalhe, imagem]
  );
  return res.rows[0];
}

async function buscarPorId(idNotificacao) {
  const res = await db.query(`${SELECT} WHERE n.id_notificacao = $1`, [idNotificacao]);
  return res.rows[0] || null;
}

/**
 * Lista paginada (mais novas primeiro).
 *  - filtro: 'todas' | 'nao-lidas' | 'mensagens' | 'social' | 'aniversario' | 'sistema'
 *  - antesDe: id da última notificação já carregada (página seguinte)
 */
async function listar(idUsuario, { limite = 30, antesDe = 0, filtro = 'todas' } = {}) {
  const params = [idUsuario];
  let where = 'n.id_usuario = $1';
  if (antesDe > 0) { params.push(antesDe); where += ` AND n.id_notificacao < $${params.length}`; }
  if (filtro === 'nao-lidas') where += ' AND n.lida = FALSE';
  else if (CATEGORIAS[filtro]) { params.push(CATEGORIAS[filtro]); where += ` AND n.tipo = ANY($${params.length})`; }
  params.push(limite);
  const res = await db.query(
    `${SELECT} WHERE ${where} ORDER BY n.id_notificacao DESC LIMIT $${params.length}`,
    params
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
    `UPDATE notificacoes SET lida = TRUE, lida_em = COALESCE(lida_em, now())
      WHERE id_notificacao = $1 AND id_usuario = $2
     RETURNING link`,
    [idNotificacao, idUsuario]
  );
  return res.rows[0] || null;
}

// Marca várias de uma vez (grupo "fulano e mais 3 curtiram").
async function marcarLidas(ids, idUsuario) {
  if (!ids.length) return;
  await db.query(
    `UPDATE notificacoes SET lida = TRUE, lida_em = COALESCE(lida_em, now())
      WHERE id_usuario = $1 AND id_notificacao = ANY($2) AND lida = FALSE`,
    [idUsuario, ids]
  );
}

async function marcarTodasLidas(idUsuario) {
  await db.query(
    `UPDATE notificacoes SET lida = TRUE, lida_em = now() WHERE id_usuario = $1 AND lida = FALSE`,
    [idUsuario]
  );
}

async function excluir(ids, idUsuario) {
  if (!ids.length) return 0;
  const res = await db.query(
    `DELETE FROM notificacoes WHERE id_usuario = $1 AND id_notificacao = ANY($2)`,
    [idUsuario, ids]
  );
  return res.rowCount;
}

async function excluirTodas(idUsuario) {
  const res = await db.query(`DELETE FROM notificacoes WHERE id_usuario = $1`, [idUsuario]);
  return res.rowCount;
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

// ---------- Preferências ----------
async function buscarPrefs(idUsuario) {
  const res = await db.query(`SELECT notif_prefs FROM usuarios WHERE id_usuario = $1`, [idUsuario]);
  return (res.rows[0] && res.rows[0].notif_prefs) || {};
}

async function salvarPrefs(idUsuario, prefs) {
  await db.query(`UPDATE usuarios SET notif_prefs = $2::jsonb WHERE id_usuario = $1`, [idUsuario, JSON.stringify(prefs)]);
}

// ---------- Push ----------
async function inserirInscricao({ idUsuario, endpoint, p256dh, auth, agente }) {
  await db.query(
    `INSERT INTO push_inscricoes (id_usuario, endpoint, p256dh, auth, agente)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
       SET id_usuario = EXCLUDED.id_usuario, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
           agente = EXCLUDED.agente, usado_em = now()`,
    [idUsuario, endpoint, p256dh, auth, agente || null]
  );
}

async function removerInscricao(endpoint, idUsuario = null) {
  if (idUsuario) await db.query(`DELETE FROM push_inscricoes WHERE endpoint = $1 AND id_usuario = $2`, [endpoint, idUsuario]);
  else await db.query(`DELETE FROM push_inscricoes WHERE endpoint = $1`, [endpoint]);
}

async function listarInscricoes(idUsuario) {
  const res = await db.query(
    `SELECT endpoint, p256dh, auth FROM push_inscricoes WHERE id_usuario = $1`,
    [idUsuario]
  );
  return res.rows;
}

async function contarInscricoes(idUsuario) {
  const res = await db.query(`SELECT COUNT(*)::int AS n FROM push_inscricoes WHERE id_usuario = $1`, [idUsuario]);
  return res.rows[0].n;
}

// ---------- Configurações internas ----------
async function lerConfig(chave) {
  const res = await db.query(`SELECT valor FROM app_config WHERE chave = $1`, [chave]);
  return res.rows[0] ? res.rows[0].valor : null;
}

async function gravarConfig(chave, valor) {
  await db.query(
    `INSERT INTO app_config (chave, valor) VALUES ($1, $2)
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`,
    [chave, valor]
  );
}

module.exports = {
  CATEGORIAS,
  inserir, buscarPorId, listar, contarNaoLidas,
  marcarLida, marcarLidas, marcarTodasLidas, excluir, excluirTodas, existeHoje,
  buscarPrefs, salvarPrefs,
  inserirInscricao, removerInscricao, listarInscricoes, contarInscricoes,
  lerConfig, gravarConfig,
};
