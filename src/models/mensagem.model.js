'use strict';

/**
 * Acesso ao banco para "mensagens_anonimas" (canal do jogo: anjo/protegido).
 * Mensagens arquivadas (sorteio refeito) ficam fora de todas as listagens.
 */
const db = require('../config/db');

async function inserir({ idCampanha, idOrigem, idDestino, tipo, mensagem, imagem = null, audio = null, video = null, respondendoA = null }) {
  const res = await db.query(
    `INSERT INTO mensagens_anonimas (id_campanha, id_usuario_origem, id_usuario_destino, tipo_mensagem, mensagem, imagem, audio, video, respondendo_a)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id_mensagem, criado_em`,
    [idCampanha, idOrigem, idDestino, tipo, mensagem, imagem, audio, video, respondendoA]
  );
  return res.rows[0];
}

// Uma mensagem pelo id (validação do "responder": tem que ser da mesma thread).
async function buscarMensagem(idMensagem) {
  const res = await db.query(`SELECT * FROM mensagens_anonimas WHERE id_mensagem = $1`, [idMensagem]);
  return res.rows[0] || null;
}

// Todas as mensagens (não arquivadas) da campanha em que o usuário participa (origem ou destino).
async function listarConversa(idCampanha, idUsuario) {
  const res = await db.query(
    `SELECT id_mensagem, id_usuario_origem, id_usuario_destino, tipo_mensagem, mensagem, imagem, audio, video, lida, editado_em, apagada_em, criado_em, respondendo_a
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
      WHERE id_mensagem = $1 AND id_usuario_origem = $2 AND arquivada = FALSE AND apagada_em IS NULL
      RETURNING id_mensagem, mensagem, editado_em`,
    [idMensagem, idUsuario, mensagem]
  );
  return res.rows[0] || null;
}

// Apaga PARA TODOS uma mensagem que EU enviei: zera o conteúdo e marca apagada.
// Retorna os caminhos de mídia antigos (para tirar do disco) ou null se não é minha.
async function apagar(idMensagem, idUsuario) {
  const res = await db.query(
    `UPDATE mensagens_anonimas m
        SET mensagem = NULL, imagem = NULL, audio = NULL, video = NULL, apagada_em = now()
       FROM (SELECT id_mensagem, imagem, audio, video FROM mensagens_anonimas
              WHERE id_mensagem = $1 AND id_usuario_origem = $2 AND arquivada = FALSE AND apagada_em IS NULL) antiga
      WHERE m.id_mensagem = antiga.id_mensagem
      RETURNING antiga.imagem, antiga.audio, antiga.video`,
    [idMensagem, idUsuario]
  );
  return res.rows[0] || null;
}

module.exports = {
  inserir,
  buscarMensagem,
  listarConversa,
  marcarRecebidasComoLidas,
  marcarRecebidasComoLidasPorTipo,
  contarNaoLidas,
  contarNaoLidasPorTipo,
  editar,
  apagar,
};
