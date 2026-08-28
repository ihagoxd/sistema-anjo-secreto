'use strict';

/**
 * Direct do escritório: conversa 1:1 com nome (não anônima) entre usuários aprovados.
 * Separado do canal anônimo anjo/protegido (mensagem.service.js).
 */
const dmModel = require('../models/mensagemDireta.model');
const usuarioModel = require('../models/usuario.model');
const notificacaoService = require('./notificacao.service');
const { apagarUpload } = require('../config/upload');

const LIMITE = 1000;

async function alvoValido(idUsuario) {
  const u = await usuarioModel.buscarPorId(idUsuario);
  if (!u || u.status !== 'APROVADO' || !u.ativo) return null;
  return u;
}

/**
 * Envia uma DM (texto e/ou imagem). Retorna { ok } ou { ok:false, motivo }.
 */
async function enviar(idRemetente, idDestinatario, texto, imagem = null, audio = null, video = null) {
  idDestinatario = Number(idDestinatario);
  if (!idDestinatario || idDestinatario === idRemetente) return { ok: false, motivo: 'ALVO_INVALIDO' };

  const texto2 = String(texto || '').trim() || null;
  if (!texto2 && !imagem && !audio && !video) return { ok: false, motivo: 'VAZIA' };
  if (texto2 && texto2.length > LIMITE) return { ok: false, motivo: 'LONGA' };

  const alvo = await alvoValido(idDestinatario);
  if (!alvo) return { ok: false, motivo: 'ALVO_INVALIDO' };

  await dmModel.inserir({ idRemetente, idDestinatario, texto: texto2, imagem, audio, video });
  await notificacaoService.notificarMensagemDireta(idDestinatario, idRemetente);
  return { ok: true };
}

// Lista as mensagens entre mim e o outro, com flag "minha".
async function listarConversaCom(idUsuario, idOutro) {
  const rows = await dmModel.listarConversa(idUsuario, idOutro);
  return rows.map((r) => ({
    id_mensagem: r.id_mensagem,
    minha: r.id_remetente === idUsuario,
    texto: r.texto,
    imagem: r.imagem,
    audio: r.audio,
    video: r.video,
    apagada: !!r.apagada_em,
    editado_em: r.editado_em,
    criado_em: r.criado_em,
  }));
}

function marcarLidas(idUsuario, idOutro) {
  return dmModel.marcarLidas(idUsuario, idOutro);
}

/**
 * Resumo para a lista de conversas: última mensagem + não lidas por contato.
 * Retorna { ultima: { [outroId]: {texto, criado_em, minha} }, naoLidas: { [outroId]: n } }.
 */
async function resumoConversas(idUsuario) {
  const [ultimas, naoLidas] = await Promise.all([
    dmModel.ultimaPorContato(idUsuario),
    dmModel.naoLidasPorContato(idUsuario),
  ]);
  const out = { ultima: {}, naoLidas: {} };
  for (const r of ultimas) out.ultima[r.outro] = { texto: r.texto, criado_em: r.criado_em, minha: r.minha };
  for (const r of naoLidas) out.naoLidas[r.outro] = r.n;
  return out;
}

/**
 * Edita uma DM que EU enviei. Retorna { ok, texto?, editada? } ou { ok:false, motivo }.
 */
async function editar(idUsuario, idMensagem, texto) {
  const texto2 = String(texto || '').trim();
  if (!texto2) return { ok: false, motivo: 'VAZIA' };
  if (texto2.length > LIMITE) return { ok: false, motivo: 'LONGA' };
  const linha = await dmModel.editar(idMensagem, idUsuario, texto2);
  if (!linha) return { ok: false, motivo: 'NAO_PERMITIDO' };
  return { ok: true, texto: linha.texto, editada: true };
}

/**
 * Apaga PARA TODOS uma mensagem que EU enviei (a mídia sai do disco).
 */
async function apagar(idUsuario, idMensagem) {
  const antiga = await dmModel.apagar(Number(idMensagem), idUsuario);
  if (!antiga) return { ok: false, motivo: 'NAO_PERMITIDO' };
  apagarUpload(antiga.imagem);
  apagarUpload(antiga.audio);
  apagarUpload(antiga.video);
  return { ok: true };
}

function contarNaoLidasTotal(idUsuario) {
  return dmModel.contarNaoLidasTotal(idUsuario);
}

module.exports = {
  enviar,
  listarConversaCom,
  marcarLidas,
  resumoConversas,
  editar,
  apagar,
  contarNaoLidasTotal,
  LIMITE,
};
