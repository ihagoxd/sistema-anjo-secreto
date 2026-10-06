'use strict';

/**
 * Acesso ao banco para a entidade "sorteios" (pares anjo → protegido).
 * id_anjo e id_protegido referenciam participantes(id_participante).
 */
const db = require('../config/db');

async function existeSorteio(idCampanha) {
  const res = await db.query(`SELECT 1 FROM sorteios WHERE id_campanha = $1 LIMIT 1`, [idCampanha]);
  return res.rowCount > 0;
}

// Quem o usuário (como ANJO) tirou — ou seja, seu protegido.
async function buscarProtegidoDoAnjo(idCampanha, idUsuario) {
  const res = await db.query(
    `SELECT u.id_usuario, u.nome, u.usuario, u.foto_perfil
       FROM sorteios s
       JOIN participantes pa ON pa.id_participante = s.id_anjo
       JOIN participantes pp ON pp.id_participante = s.id_protegido
       JOIN usuarios u ON u.id_usuario = pp.id_usuario
      WHERE s.id_campanha = $1 AND pa.id_usuario = $2`,
    [idCampanha, idUsuario]
  );
  return res.rows[0] || null;
}

// Quem é o ANJO de um usuário (como protegido). USO RESTRITO:
// nunca exibir ao protegido — só validação interna / revelação pelo admin (com log).
async function buscarAnjoDoProtegido(idCampanha, idUsuario) {
  const res = await db.query(
    `SELECT u.id_usuario, u.nome, u.usuario, u.foto_perfil
       FROM sorteios s
       JOIN participantes pp ON pp.id_participante = s.id_protegido
       JOIN participantes pa ON pa.id_participante = s.id_anjo
       JOIN usuarios u ON u.id_usuario = pa.id_usuario
      WHERE s.id_campanha = $1 AND pp.id_usuario = $2`,
    [idCampanha, idUsuario]
  );
  return res.rows[0] || null;
}

// Todos os pares (anjo → protegido). USO RESTRITO: só na tela emergencial do admin (com log).
async function listarPares(idCampanha) {
  const res = await db.query(
    `SELECT ua.id_usuario AS anjo_id, ua.nome AS anjo_nome, ua.usuario AS anjo_usuario, ua.foto_perfil AS anjo_foto,
            (ua.ativo AND ua.status = 'APROVADO') AS anjo_ativo,
            up.id_usuario AS protegido_id, up.nome AS protegido_nome, up.usuario AS protegido_usuario, up.foto_perfil AS protegido_foto,
            (up.ativo AND up.status = 'APROVADO') AS protegido_ativo
       FROM sorteios s
       JOIN participantes pa ON pa.id_participante = s.id_anjo
       JOIN participantes pp ON pp.id_participante = s.id_protegido
       JOIN usuarios ua ON ua.id_usuario = pa.id_usuario
       JOIN usuarios up ON up.id_usuario = pp.id_usuario
      WHERE s.id_campanha = $1
      ORDER BY lower(ua.nome) ASC`,
    [idCampanha]
  );
  return res.rows;
}

module.exports = { existeSorteio, buscarProtegidoDoAnjo, buscarAnjoDoProtegido, listarPares };
