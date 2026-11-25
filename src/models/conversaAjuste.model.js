'use strict';

/**
 * Ajustes de cada pessoa por conversa do Direct (canal 'u' = pessoa, 'g' = grupo):
 * silenciada (não notifica) e limpa_em (apagou a conversa só para si).
 */
const db = require('../config/db');

// Todos os ajustes da pessoa: { 'u:5': { silenciada, limpa_em }, 'g:2': {...} }
async function daPessoa(idUsuario) {
  const res = await db.query(`SELECT canal, id_alvo, silenciada, limpa_em FROM conversa_ajustes WHERE id_usuario = $1`, [idUsuario]);
  const mapa = {};
  res.rows.forEach((r) => { mapa[r.canal + ':' + r.id_alvo] = { silenciada: r.silenciada, limpa_em: r.limpa_em }; });
  return mapa;
}

async function buscar(idUsuario, canal, idAlvo) {
  const res = await db.query(
    `SELECT silenciada, limpa_em FROM conversa_ajustes WHERE id_usuario = $1 AND canal = $2 AND id_alvo = $3`,
    [idUsuario, canal, idAlvo]
  );
  return res.rows[0] || null;
}

async function estaSilenciada(idUsuario, canal, idAlvo) {
  const a = await buscar(idUsuario, canal, idAlvo);
  return !!(a && a.silenciada);
}

async function definirSilencio(idUsuario, canal, idAlvo, silenciada) {
  await db.query(
    `INSERT INTO conversa_ajustes (id_usuario, canal, id_alvo, silenciada) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id_usuario, canal, id_alvo) DO UPDATE SET silenciada = EXCLUDED.silenciada`,
    [idUsuario, canal, idAlvo, !!silenciada]
  );
}

async function limpar(idUsuario, canal, idAlvo) {
  await db.query(
    `INSERT INTO conversa_ajustes (id_usuario, canal, id_alvo, limpa_em) VALUES ($1, $2, $3, now())
     ON CONFLICT (id_usuario, canal, id_alvo) DO UPDATE SET limpa_em = now()`,
    [idUsuario, canal, idAlvo]
  );
}

module.exports = { daPessoa, buscar, estaSilenciada, definirSilencio, limpar };
