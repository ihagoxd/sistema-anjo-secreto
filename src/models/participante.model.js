'use strict';

/**
 * Acesso ao banco para a entidade "participantes" (vínculo usuário ↔ campanha).
 */
const db = require('../config/db');

async function adicionar(idCampanha, idUsuario) {
  const res = await db.query(
    `INSERT INTO participantes (id_campanha, id_usuario) VALUES ($1, $2)
     RETURNING id_participante, id_campanha, id_usuario, ativo, criado_em`,
    [idCampanha, idUsuario]
  );
  return res.rows[0];
}

// Remoção (antes do sorteio): apaga o vínculo.
async function remover(idParticipante, idCampanha) {
  const res = await db.query(
    `DELETE FROM participantes WHERE id_participante = $1 AND id_campanha = $2 RETURNING id_participante`,
    [idParticipante, idCampanha]
  );
  return res.rowCount > 0;
}

// Lista os participantes da campanha com os dados do usuário.
async function listarPorCampanha(idCampanha) {
  const res = await db.query(
    `SELECT p.id_participante, p.ativo, p.criado_em,
            u.id_usuario, u.nome, u.usuario
       FROM participantes p
       JOIN usuarios u ON u.id_usuario = p.id_usuario
      WHERE p.id_campanha = $1
      ORDER BY lower(u.nome) ASC`,
    [idCampanha]
  );
  return res.rows;
}

// Usuários que PODEM ser adicionados: aprovados, ativos e ainda não participantes.
async function listarElegiveis(idCampanha) {
  const res = await db.query(
    `SELECT id_usuario, nome, usuario
       FROM usuarios
      WHERE status = 'APROVADO' AND ativo = TRUE
        AND id_usuario NOT IN (SELECT id_usuario FROM participantes WHERE id_campanha = $1)
      ORDER BY lower(nome) ASC`,
    [idCampanha]
  );
  return res.rows;
}

module.exports = { adicionar, remover, listarPorCampanha, listarElegiveis };
