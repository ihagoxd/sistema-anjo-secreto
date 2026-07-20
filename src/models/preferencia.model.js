'use strict';

/**
 * Acesso ao banco para "preferencias_usuario" (uma linha por usuário).
 */
const db = require('../config/db');

const CAMPOS = [
  'lanche_favorito',
  'bebida_favorita',
  'chocolate_favorito',
  'hobbies',
  'restricoes_alimentares',
  'coisas_que_gosta',
  'coisas_que_nao_gosta',
  'observacoes',
];

async function buscarPorUsuario(idUsuario) {
  const res = await db.query(`SELECT * FROM preferencias_usuario WHERE id_usuario = $1`, [idUsuario]);
  return res.rows[0] || null;
}

// Upsert: cria ou atualiza as preferências do usuário.
async function salvar(idUsuario, dados) {
  const valores = CAMPOS.map((c) => dados[c]);
  const placeholders = CAMPOS.map((_, i) => `$${i + 2}`).join(', ');
  const updates = CAMPOS.map((c) => `${c} = EXCLUDED.${c}`).join(', ');
  const res = await db.query(
    `INSERT INTO preferencias_usuario (id_usuario, ${CAMPOS.join(', ')})
     VALUES ($1, ${placeholders})
     ON CONFLICT (id_usuario) DO UPDATE SET ${updates}
     RETURNING *`,
    [idUsuario, ...valores]
  );
  return res.rows[0];
}

// ---------- Galeria de fotos das preferências ----------
async function adicionarFoto(idUsuario, caminho) {
  const res = await db.query(
    `INSERT INTO preferencias_fotos (id_usuario, caminho) VALUES ($1, $2) RETURNING id_foto, caminho`,
    [idUsuario, caminho]
  );
  return res.rows[0];
}

async function listarFotos(idUsuario) {
  const res = await db.query(
    `SELECT id_foto, caminho, legenda FROM preferencias_fotos WHERE id_usuario = $1 ORDER BY criado_em ASC`,
    [idUsuario]
  );
  return res.rows;
}

async function buscarFoto(idFoto, idUsuario) {
  const res = await db.query(
    `SELECT id_foto, caminho FROM preferencias_fotos WHERE id_foto = $1 AND id_usuario = $2`,
    [idFoto, idUsuario]
  );
  return res.rows[0] || null;
}

async function removerFoto(idFoto, idUsuario) {
  await db.query(`DELETE FROM preferencias_fotos WHERE id_foto = $1 AND id_usuario = $2`, [idFoto, idUsuario]);
}

async function atualizarLegenda(idFoto, idUsuario, legenda) {
  await db.query(
    `UPDATE preferencias_fotos SET legenda = $3 WHERE id_foto = $1 AND id_usuario = $2`,
    [idFoto, idUsuario, legenda]
  );
}

async function contarFotos(idUsuario) {
  const res = await db.query(`SELECT COUNT(*)::int AS n FROM preferencias_fotos WHERE id_usuario = $1`, [idUsuario]);
  return res.rows[0].n;
}

module.exports = {
  buscarPorUsuario, salvar, CAMPOS,
  adicionarFoto, listarFotos, buscarFoto, removerFoto, atualizarLegenda, contarFotos,
};
