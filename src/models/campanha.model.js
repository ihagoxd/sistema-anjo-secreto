'use strict';

/**
 * Acesso ao banco para a entidade "campanhas".
 */
const db = require('../config/db');

const COLUNAS = `id_campanha, nome, descricao, status, criado_em, atualizado_em, encerrado_em`;

async function criar({ nome, descricao }) {
  const res = await db.query(
    `INSERT INTO campanhas (nome, descricao, status) VALUES ($1, $2, 'RASCUNHO')
     RETURNING ${COLUNAS}`,
    [nome, descricao]
  );
  return res.rows[0];
}

async function atualizar(idCampanha, { nome, descricao }) {
  const res = await db.query(
    `UPDATE campanhas SET nome = $2, descricao = $3 WHERE id_campanha = $1 RETURNING ${COLUNAS}`,
    [idCampanha, nome, descricao]
  );
  return res.rows[0];
}

async function atualizarStatus(idCampanha, status, encerrar = false) {
  const res = await db.query(
    `UPDATE campanhas
        SET status = $2,
            encerrado_em = CASE WHEN $3 THEN now() ELSE encerrado_em END
      WHERE id_campanha = $1 RETURNING ${COLUNAS}`,
    [idCampanha, status, encerrar]
  );
  return res.rows[0];
}

// Apaga a campanha (participantes, sorteios e mensagens do jogo caem por CASCADE).
async function remover(idCampanha) {
  const res = await db.query(
    `DELETE FROM campanhas WHERE id_campanha = $1 RETURNING ${COLUNAS}`,
    [idCampanha]
  );
  return res.rows[0] || null;
}

async function buscarPorId(idCampanha) {
  const res = await db.query(`SELECT ${COLUNAS} FROM campanhas WHERE id_campanha = $1`, [idCampanha]);
  return res.rows[0] || null;
}

// Campanha em andamento (no máximo uma — garantido por índice único).
async function buscarAtiva() {
  const res = await db.query(`SELECT ${COLUNAS} FROM campanhas WHERE status = 'EM_ANDAMENTO' LIMIT 1`);
  return res.rows[0] || null;
}

async function listarTodas() {
  const res = await db.query(`SELECT ${COLUNAS} FROM campanhas ORDER BY criado_em DESC`);
  return res.rows;
}

async function contarTotal() {
  const res = await db.query(`SELECT COUNT(*)::int AS n FROM campanhas`);
  return res.rows[0].n;
}

// Quantos participantes ATIVOS a campanha tem (usado no detalhe e no sorteio).
async function contarParticipantes(idCampanha) {
  const res = await db.query(
    `SELECT COUNT(*)::int AS n FROM participantes WHERE id_campanha = $1 AND ativo = TRUE`,
    [idCampanha]
  );
  return res.rows[0].n;
}

module.exports = {
  criar,
  atualizar,
  atualizarStatus,
  remover,
  buscarPorId,
  buscarAtiva,
  listarTodas,
  contarTotal,
  contarParticipantes,
};
