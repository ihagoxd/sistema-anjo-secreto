'use strict';

/**
 * Chat anônimo entre anjo e protegido.
 *
 * Cada usuário tem DUAS conversas na campanha:
 *  - com o seu PROTEGIDO  (ele é o anjo — sabe o nome);
 *  - com o seu ANJO       (anônimo — nunca sabe o nome).
 *
 * O destinatário é sempre DERIVADO do sorteio (o usuário nunca o informa),
 * e o remetente aparece de forma genérica para o destinatário.
 */
const mensagemModel = require('../models/mensagem.model');
const campanhaModel = require('../models/campanha.model');
const sorteioService = require('./sorteio.service');
const notificacaoService = require('./notificacao.service');

const LIMITE = 1000;

/**
 * Envia uma mensagem. alvo: 'protegido' | 'anjo'.
 */
async function enviarMensagemAnonima(idCampanha, idRemetente, alvo, texto, imagem = null, audio = null) {
  const campanha = await campanhaModel.buscarPorId(idCampanha);
  if (!campanha) return { ok: false, motivo: 'SEM_CAMPANHA' };
  if (campanha.status !== 'EM_ANDAMENTO') return { ok: false, motivo: 'NAO_ATIVA' };

  const mensagem = String(texto || '').trim() || null;
  if (!mensagem && !imagem && !audio) return { ok: false, motivo: 'VAZIA' };
  if (mensagem && mensagem.length > LIMITE) return { ok: false, motivo: 'LONGA' };

  let destino;
  let tipo;
  if (alvo === 'protegido') {
    const p = await sorteioService.buscarProtegidoDoAnjo(idCampanha, idRemetente);
    if (!p) return { ok: false, motivo: 'SEM_VINCULO' };
    destino = p.id_usuario;
    tipo = 'ANJO_PARA_PROTEGIDO';
  } else if (alvo === 'anjo') {
    const a = await sorteioService.buscarAnjoDoProtegido(idCampanha, idRemetente);
    if (!a) return { ok: false, motivo: 'SEM_VINCULO' };
    destino = a.id_usuario;
    tipo = 'PROTEGIDO_PARA_ANJO';
  } else {
    return { ok: false, motivo: 'ALVO_INVALIDO' };
  }

  await mensagemModel.inserir({ idCampanha, idOrigem: idRemetente, idDestino: destino, tipo, mensagem, imagem, audio });
  await notificacaoService.notificarMensagemJogo(destino, alvo);
  return { ok: true };
}

/**
 * Monta as duas threads do usuário a partir das mensagens (sem expor ids).
 * Classificação relativa a "mim" (idUsuario):
 *  - thread PROTEGIDO: eu→protegido (ANJO_PARA_PROTEGIDO meu) ou protegido→eu (PROTEGIDO_PARA_ANJO p/ mim)
 *  - thread ANJO:      eu→anjo (PROTEGIDO_PARA_ANJO meu) ou anjo→eu (ANJO_PARA_PROTEGIDO p/ mim)
 */
// Função PURA (testável): separa as linhas nas duas threads, relativo a "mim".
function classificarMensagens(rows, idUsuario) {
  const comProtegido = [];
  const comAnjo = [];
  for (const r of rows) {
    const minha = r.id_usuario_origem === idUsuario;
    const item = { id_mensagem: r.id_mensagem, minha, texto: r.mensagem, imagem: r.imagem, audio: r.audio, editado_em: r.editado_em, criado_em: r.criado_em };
    if (r.tipo_mensagem === 'ANJO_PARA_PROTEGIDO') {
      (minha ? comProtegido : comAnjo).push(item);
    } else {
      // PROTEGIDO_PARA_ANJO
      (minha ? comAnjo : comProtegido).push(item);
    }
  }
  return { comProtegido, comAnjo };
}

async function listarConversa(idCampanha, idUsuario) {
  const rows = await mensagemModel.listarConversa(idCampanha, idUsuario);
  return classificarMensagens(rows, idUsuario);
}

function marcarComoLidas(idCampanha, idUsuario) {
  return mensagemModel.marcarRecebidasComoLidas(idCampanha, idUsuario);
}

// Marca lidas de uma thread só: alvo 'anjo' (recebidas do meu anjo) | 'protegido' (do meu protegido).
function marcarThreadLida(idCampanha, idUsuario, alvo) {
  const tipo = alvo === 'anjo' ? 'ANJO_PARA_PROTEGIDO' : 'PROTEGIDO_PARA_ANJO';
  return mensagemModel.marcarRecebidasComoLidasPorTipo(idCampanha, idUsuario, tipo);
}

function contarNaoLidas(idCampanha, idUsuario) {
  return mensagemModel.contarNaoLidas(idCampanha, idUsuario);
}

// { anjo, protegido } — não lidas por thread.
function contarNaoLidasPorTipo(idCampanha, idUsuario) {
  return mensagemModel.contarNaoLidasPorTipo(idCampanha, idUsuario);
}

/**
 * Edita uma mensagem do jogo que EU enviei. Retorna { ok, texto?, editada? } ou { ok:false, motivo }.
 */
async function editarMensagem(idUsuario, idMensagem, texto) {
  const mensagem = String(texto || '').trim();
  if (!mensagem) return { ok: false, motivo: 'VAZIA' };
  if (mensagem.length > LIMITE) return { ok: false, motivo: 'LONGA' };
  const linha = await mensagemModel.editar(idMensagem, idUsuario, mensagem);
  if (!linha) return { ok: false, motivo: 'NAO_PERMITIDO' };
  return { ok: true, texto: linha.mensagem, editada: true };
}

module.exports = {
  enviarMensagemAnonima,
  listarConversa,
  classificarMensagens,
  marcarComoLidas,
  marcarThreadLida,
  contarNaoLidas,
  contarNaoLidasPorTipo,
  editarMensagem,
  LIMITE,
};
