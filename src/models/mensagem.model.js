'use strict';

/**
 * Acesso ao banco para "mensagens_anonimas" (canal do jogo: anjo/protegido).
 * Mensagens arquivadas (sorteio refeito) ficam fora de todas as listagens.
 */
const db = require('../config/db');

async function inserir({ idCampanha, idOrigem, idDestino, tipo, mensagem, imagem = null }) {
  const res = await db.query(
    `INSERT INTO mensagens_anonimas (id_campanha, id_usuario_origem, id_usuario_destino, tipo_mensagem, mensagem, imagem)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id_mensagem, criado_em`,
    [idCampanha, idOrigem, idDestino, tipo, mensagem, imagem]
  );
  return res.rows[0];
}

// Todas as mensagens (não arquivadas) da campanha em que o usuário participa (origem ou destino).
async function listarConversa(idCampanha, idUsuario) {
  const res = await db.query(
    `SELECT id_mensagem, id_usuario_origem, id_usuario_destino, tipo_mensagem, mensagem, imagem, lida, editado_em, criado_em
       FROM mensagens_anonimas
      WHERE id_campanha = $1 AND arquivada = FALSE
        AND ($2 IN (id_usuario_origem, id_usuario_destino))
      ORDER BY criado_em ASC`,
    [idCampanha, idUsuario]
  );
  return res.rows;
}

// Marca como lidas apenas as recebidas de um determinado tipo (thread anjo OU protegido).
// tipos: 'ANJO_PARA_PROTEGIDO' (recebidas do meu anjo) | 'PROTEGIDO_PARA_ANJO' (recebidas do meu protegido).
async function marcarRecebidasComoLidasPorTipo(idCampanha, idUsuario, tipo) {
  await db.query(
    `UPDATE mensagens_anonimas SET lida = TRUE
      WHERE id_campanha = $1 AND id_usuario_destino = $2 AND tipo_mensagem = $3
        AND lida = FALSE AND arquivada = FALSE`,
    [idCampanha, idUsuario, tipo]
  );
}

async function marcarRecebidasComoLidas(idCampanha, idUsuario) {
  await db.query(
    `UPDATE mensagens_anonimas SET lida = TRUE
      WHERE id_campanha = $1 AND id_usuario_destino = $2 AND lida = FALSE AND arquivada = FALSE`,
    [idCampanha, idUsuario]
  );
}

async function contarNaoLidas(idCampanha, idUsuario) {
  const res = await db.query(
    `SELECT COUNT(*)::int AS n FROM mensagens_anonimas
      WHERE id_campanha = $1 AND id_usuario_destino = $2 AND lida = FALSE AND arquivada = FALSE`,
    [idCampanha, idUsuario]
  );
  return res.rows[0].n;
}

// Não lidas separadas por thread: { anjo, protegido } (relativo a "mim").
//  - recebidas ANJO_PARA_PROTEGIDO  => vieram do meu ANJO
//  - recebidas PROTEGIDO_PARA_ANJO  => vieram do meu PROTEGIDO
async function contarNaoLidasPorTipo(idCampanha, idUsuario) {
  const res = await db.query(
    `SELECT tipo_mensagem, COUNT(*)::int AS n FROM mensagens_anonimas
      WHERE id_campanha = $1 AND id_usuario_destino = $2 AND lida = FALSE AND arquivada = FALSE
      GROUP BY tipo_mensagem`,
    [idCampanha, idUsuario]
  );
  const out = { anjo: 0, protegido: 0 };
  for (const r of res.rows) {
    if (r.tipo_mensagem === 'ANJO_PARA_PROTEGIDO') out.anjo = r.n;
    else out.protegido = r.n;
  }
  return out;
}

// Edita uma mensagem que EU enviei (origem = idUsuario). Marca editado_em.
// Retorna a linha atualizada ou null (não é minha / não existe / arquivada).
async function editar(idMensagem, idUsuario, mensagem) {
  const res = await db.query(
    `UPDATE mensagens_anonimas
        SET mensagem = $3, editado_em = now()
      WHERE id_mensagem = $1 AND id_usuario_origem = $2 AND arquivada = FALSE
      RETURNING id_mensagem, mensagem, editado_em`,
    [idMensagem, idUsuario, mensagem]
  );
  return res.rows[0] || null;
}

module.exports = {
  inserir,
  listarConversa,
  marcarRecebidasComoLidas,
  marcarRecebidasComoLidasPorTipo,
  contarNaoLidas,
  contarNaoLidasPorTipo,
  editar,
};
