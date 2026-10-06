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

// Lista os participantes da campanha com os dados do usuário e, para o admin,
// a situação da pessoa (ainda ativa/aprovada?), se já tem par no sorteio e
// quantas mensagens do jogo ela mandou nesta rodada (sem revelar para quem).
async function listarPorCampanha(idCampanha) {
  const res = await db.query(
    `SELECT p.id_participante, p.ativo, p.criado_em,
            u.id_usuario, u.nome, u.usuario, u.foto_perfil,
            (u.ativo AND u.status = 'APROVADO') AS usuario_ativo,
            EXISTS (SELECT 1 FROM sorteios s WHERE s.id_campanha = p.id_campanha AND s.id_anjo = p.id_participante) AS tem_par,
            (SELECT COUNT(*)::int FROM mensagens_anonimas m
              WHERE m.id_campanha = p.id_campanha AND m.id_usuario_origem = u.id_usuario AND m.arquivada = FALSE) AS msgs_enviadas,
            (SELECT COUNT(*)::int FROM mensagens_anonimas m
              WHERE m.id_campanha = p.id_campanha AND m.id_usuario_destino = u.id_usuario AND m.arquivada = FALSE) AS msgs_recebidas
       FROM participantes p
       JOIN usuarios u ON u.id_usuario = p.id_usuario
      WHERE p.id_campanha = $1
      ORDER BY p.ativo DESC, lower(u.nome) ASC`,
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

// Resumo das mensagens do jogo na campanha (painel do admin): total e quantas pessoas
// já mandaram ao menos uma — sem expor conteúdo nem pares.
async function resumoMensagens(idCampanha) {
  const res = await db.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(DISTINCT id_usuario_origem)::int AS pessoas,
            MAX(criado_em) AS ultima
       FROM mensagens_anonimas
      WHERE id_campanha = $1 AND arquivada = FALSE`,
    [idCampanha]
  );
  return res.rows[0];
}

module.exports = { adicionar, remover, listarPorCampanha, listarElegiveis, resumoMensagens };
