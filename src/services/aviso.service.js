'use strict';

/**
 * Avisos da administração: cards que aparecem na tela de todo mundo
 * (atualizações do sistema, recados, datas importantes).
 */
const avisoModel = require('../models/aviso.model');
const notificacaoService = require('./notificacao.service');

const TEMAS = ['dourado', 'azul', 'verde', 'roxo', 'vermelho', 'escuro'];
const FREQUENCIAS = ['uma_vez', 'diario'];
const LIMITES = { titulo: 80, mensagem: 600, emoji: 16, link: 300, linkTexto: 40 };

function limpar(s, max) {
  return String(s || '').trim().replace(/\r\n/g, '\n').slice(0, max);
}

// Normaliza + valida o formulário. Retorna { ok, dados } ou { ok:false, erro }.
function validar(body) {
  const titulo = limpar(body.titulo, LIMITES.titulo);
  const mensagem = limpar(body.mensagem, LIMITES.mensagem);
  const emoji = limpar(body.emoji, LIMITES.emoji) || '📢';
  const tema = TEMAS.includes(body.tema) ? body.tema : 'dourado';
  let link = limpar(body.link, LIMITES.link) || null;
  const linkTexto = limpar(body.link_texto, LIMITES.linkTexto) || null;
  const ativo = body.ativo !== '0' && body.ativo !== 'false' && body.ativo !== false;
  const frequencia = FREQUENCIAS.includes(body.frequencia) ? body.frequencia : 'uma_vez';

  if (titulo.length < 2) return { ok: false, erro: 'Dê um título ao aviso (mínimo 2 caracteres).' };
  if (!mensagem) return { ok: false, erro: 'Escreva a mensagem do aviso.' };
  if (link) {
    // Só http(s) ou caminho interno (/mensagens, /feed...) — nada de javascript: etc.
    if (!/^(https?:\/\/|\/)/i.test(link)) link = 'https://' + link;
    if (!/^(https?:\/\/[^\s]+|\/[^\s]*)$/i.test(link)) return { ok: false, erro: 'Link inválido. Use um endereço http(s) ou um caminho do sistema (ex.: /feed).' };
  }

  let expiraEm = null;
  if (body.expira_em) {
    const d = new Date(`${String(body.expira_em).slice(0, 10)}T23:59:59`);
    if (Number.isNaN(d.getTime())) return { ok: false, erro: 'Data de validade inválida.' };
    expiraEm = d;
  }

  return { ok: true, dados: { titulo, mensagem, emoji, tema, link, linkTexto: link ? (linkTexto || 'Saiba mais') : null, ativo, frequencia, expiraEm } };
}

async function criar(body, criadoPor) {
  const v = validar(body);
  if (!v.ok) return v;
  const { id_aviso } = await avisoModel.criar(Object.assign({ criadoPor }, v.dados));
  const aviso = await avisoModel.buscarPorId(id_aviso);
  if (aviso.ativo) await notificarTodos(aviso, criadoPor);
  return { ok: true, aviso };
}

async function atualizar(idAviso, body) {
  const v = validar(body);
  if (!v.ok) return v;
  const r = await avisoModel.atualizar(idAviso, v.dados);
  if (!r) return { ok: false, erro: 'Aviso não encontrado.' };
  if (body.reexibir === '1') await avisoModel.limparVistos(idAviso); // volta a aparecer para todos
  return { ok: true, aviso: await avisoModel.buscarPorId(idAviso) };
}

// Notificação (sino/toast/push) para cada pessoa quando o aviso é publicado.
async function notificarTodos(aviso, excetoId) {
  const ids = await avisoModel.idsDestinatarios(excetoId);
  await notificacaoService.notificarAviso(ids, aviso);
}

function listar() { return avisoModel.listar(); }
function buscarPorId(id) { return avisoModel.buscarPorId(id); }
function alternarAtivo(id) { return avisoModel.alternarAtivo(id); }
function excluir(id) { return avisoModel.excluir(id); }
function pendentesPara(idUsuario) { return avisoModel.pendentesPara(idUsuario); }
function marcarVisto(idAviso, idUsuario) { return avisoModel.marcarVisto(idAviso, idUsuario); }

module.exports = { TEMAS, FREQUENCIAS, LIMITES, validar, criar, atualizar, listar, buscarPorId, alternarAtivo, excluir, pendentesPara, marcarVisto };
