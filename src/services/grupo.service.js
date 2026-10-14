'use strict';

/**
 * Grupos do Direct do escritório (como no Instagram/WhatsApp): qualquer pessoa
 * aprovada cria um grupo, escolhe quem entra, manda texto/foto/áudio/vídeo,
 * adiciona gente, renomeia e sai. Mensagens "de sistema" (criou, adicionou,
 * saiu, renomeou) aparecem no meio da conversa. Nada aqui toca o canal do Anjo.
 */
const grupoModel = require('../models/grupo.model');
const usuarioModel = require('../models/usuario.model');
const notificacaoService = require('./notificacao.service');
const conversaService = require('./conversa.service');
const { apagarUpload } = require('../config/upload');

const LIMITE = 1000;
const NOME_MAX = 60;
const MEMBROS_MAX = 100;

function primeiroNome(u) { return u && u.nome ? String(u.nome).trim().split(/\s+/)[0] : 'Alguém'; }
function limparNome(nome) { return String(nome || '').trim().replace(/\s+/g, ' ').slice(0, NOME_MAX); }
function listaNomes(nomes) {
  if (nomes.length <= 1) return nomes[0] || '';
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

// Só pessoas aprovadas, ativas e participantes entram (e nunca eu mesmo como convidado).
async function filtrarConvidados(ids, me) {
  const brutos = Array.isArray(ids) ? ids : String(ids || '').split(',');
  const unicos = [...new Set(brutos.map(Number).filter((n) => n > 0 && n !== me))].slice(0, MEMBROS_MAX);
  const ok = [];
  for (const id of unicos) {
    const u = await usuarioModel.buscarPorId(id);
    if (u && u.status === 'APROVADO' && u.ativo && u.tipo_usuario !== 'ADMINISTRADOR') ok.push(u);
  }
  return ok;
}

async function sistema(idGrupo, me, texto) {
  const m = await grupoModel.inserirMensagem({ idGrupo, idRemetente: me, texto, sistema: true });
  return { id_mensagem: m.id_mensagem, texto };
}

async function criar(me, nome, ids) {
  nome = limparNome(nome);
  if (!nome) return { ok: false, motivo: 'NOME' };
  const convidados = await filtrarConvidados(ids, me);
  if (!convidados.length) return { ok: false, motivo: 'SEM_MEMBROS' };
  const eu = await usuarioModel.buscarPorId(me);
  const idGrupo = await grupoModel.criar(nome, me, convidados.map((u) => u.id_usuario));
  await sistema(idGrupo, me, `${primeiroNome(eu)} criou o grupo "${nome}"`);
  await Promise.all(convidados.map((u) => notificacaoService.notificarGrupoAdd(u.id_usuario, me, idGrupo, nome)));
  return { ok: true, id_grupo: idGrupo, nome, membros: convidados.map((u) => u.id_usuario) };
}

// Grupo + membros, só para quem participa (senão null).
async function abrir(me, idGrupo) {
  idGrupo = Number(idGrupo);
  if (!idGrupo || !(await grupoModel.ehMembro(idGrupo, me))) return null;
  const grupo = await grupoModel.buscar(idGrupo);
  if (!grupo) return null;
  return { grupo, membros: await grupoModel.membros(idGrupo) };
}

async function enviar(me, idGrupo, texto, imagem = null, audio = null, video = null, respondendoA = null) {
  idGrupo = Number(idGrupo);
  if (!idGrupo || !(await grupoModel.ehMembro(idGrupo, me))) return { ok: false, motivo: 'ALVO_INVALIDO' };
  const texto2 = String(texto || '').trim() || null;
  if (!texto2 && !imagem && !audio && !video) return { ok: false, motivo: 'VAZIA' };
  if (texto2 && texto2.length > LIMITE) return { ok: false, motivo: 'LONGA' };

  // "Responder": só cita mensagem DESTE grupo (e nunca uma de sistema).
  let citada = null;
  if (respondendoA) {
    const q = await grupoModel.buscarMensagem(Number(respondendoA));
    if (q && q.id_grupo === idGrupo && !q.sistema) citada = q.id_mensagem;
  }

  const nova = await grupoModel.inserirMensagem({ idGrupo, idRemetente: me, texto: texto2, imagem, audio, video, respondendoA: citada });
  const grupo = await grupoModel.buscar(idGrupo);
  const membros = (await grupoModel.idsMembros(idGrupo)).filter((id) => id !== me);
  await Promise.all(membros.map((id) => notificacaoService.notificarGrupo(id, me, idGrupo, grupo.nome, { texto: texto2, imagem, audio, video })));
  return { ok: true, id_mensagem: nova.id_mensagem, criado_em: nova.criado_em, membros, grupo };
}

async function listarConversa(idGrupo, me) {
  const rows = await grupoModel.listarMensagens(idGrupo);
  return rows.map((r) => conversaService.itemGrupo(r, me));
}

async function adicionar(me, idGrupo, ids) {
  idGrupo = Number(idGrupo);
  if (!idGrupo || !(await grupoModel.ehMembro(idGrupo, me))) return { ok: false, motivo: 'ALVO_INVALIDO' };
  const convidados = await filtrarConvidados(ids, me);
  const novos = await grupoModel.adicionar(idGrupo, convidados.map((u) => u.id_usuario));
  if (!novos.length) return { ok: false, motivo: 'SEM_MEMBROS' };
  const grupo = await grupoModel.buscar(idGrupo);
  const eu = await usuarioModel.buscarPorId(me);
  const nomes = convidados.filter((u) => novos.includes(u.id_usuario)).map(primeiroNome);
  const s = await sistema(idGrupo, me, `${primeiroNome(eu)} adicionou ${listaNomes(nomes)}`);
  await Promise.all(novos.map((id) => notificacaoService.notificarGrupoAdd(id, me, idGrupo, grupo.nome)));
  return { ok: true, novos, grupo, membros: await grupoModel.idsMembros(idGrupo), id_mensagem: s.id_mensagem, texto: s.texto };
}

async function sair(me, idGrupo) {
  idGrupo = Number(idGrupo);
  if (!idGrupo || !(await grupoModel.remover(idGrupo, me))) return { ok: false, motivo: 'ALVO_INVALIDO' };
  const restantes = await grupoModel.idsMembros(idGrupo);
  if (!restantes.length) {
    await grupoModel.apagarGrupo(idGrupo);
    return { ok: true, apagado: true, membros: [] };
  }
  const eu = await usuarioModel.buscarPorId(me);
  const s = await sistema(idGrupo, me, `${primeiroNome(eu)} saiu do grupo`);
  return { ok: true, grupo: await grupoModel.buscar(idGrupo), membros: restantes, id_mensagem: s.id_mensagem, texto: s.texto };
}

async function renomear(me, idGrupo, nome) {
  idGrupo = Number(idGrupo);
  nome = limparNome(nome);
  if (!nome) return { ok: false, motivo: 'NOME' };
  if (!idGrupo || !(await grupoModel.ehMembro(idGrupo, me))) return { ok: false, motivo: 'ALVO_INVALIDO' };
  await grupoModel.renomear(idGrupo, nome);
  const eu = await usuarioModel.buscarPorId(me);
  const s = await sistema(idGrupo, me, `${primeiroNome(eu)} mudou o nome do grupo para "${nome}"`);
  return { ok: true, nome, membros: await grupoModel.idsMembros(idGrupo), id_mensagem: s.id_mensagem, texto: s.texto };
}

// Foto do grupo (opcional): caminho novo ou null para remover. A antiga sai do disco.
async function definirFoto(me, idGrupo, caminho) {
  idGrupo = Number(idGrupo);
  if (!idGrupo || !(await grupoModel.ehMembro(idGrupo, me))) return { ok: false, motivo: 'ALVO_INVALIDO' };
  const grupo = await grupoModel.buscar(idGrupo);
  if (grupo.foto) apagarUpload(grupo.foto);
  await grupoModel.definirFoto(idGrupo, caminho);
  const eu = await usuarioModel.buscarPorId(me);
  const s = await sistema(idGrupo, me, caminho ? `${primeiroNome(eu)} mudou a foto do grupo` : `${primeiroNome(eu)} removeu a foto do grupo`);
  return { ok: true, foto: caminho, grupo, membros: await grupoModel.idsMembros(idGrupo), id_mensagem: s.id_mensagem, texto: s.texto };
}

// Só quem criou o grupo tira alguém (como no WhatsApp).
async function removerMembro(me, idGrupo, alvo) {
  idGrupo = Number(idGrupo); alvo = Number(alvo);
  if (!idGrupo || !alvo || alvo === me) return { ok: false, motivo: 'ALVO_INVALIDO' };
  if (!(await grupoModel.ehAdmin(idGrupo, me))) return { ok: false, motivo: 'SO_ADMIN' };
  const u = await usuarioModel.buscarPorId(alvo);
  if (!u || !(await grupoModel.remover(idGrupo, alvo))) return { ok: false, motivo: 'ALVO_INVALIDO' };
  const eu = await usuarioModel.buscarPorId(me);
  const s = await sistema(idGrupo, me, `${primeiroNome(eu)} removeu ${primeiroNome(u)}`);
  return { ok: true, grupo: await grupoModel.buscar(idGrupo), membros: await grupoModel.idsMembros(idGrupo), id_mensagem: s.id_mensagem, texto: s.texto };
}

async function editar(me, idMensagem, texto) {
  const texto2 = String(texto || '').trim();
  if (!texto2) return { ok: false, motivo: 'VAZIA' };
  if (texto2.length > LIMITE) return { ok: false, motivo: 'LONGA' };
  const linha = await grupoModel.editar(Number(idMensagem), me, texto2);
  if (!linha) return { ok: false, motivo: 'NAO_PERMITIDO' };
  return { ok: true, texto: linha.texto, editada: true };
}

async function apagar(me, idMensagem) {
  const antiga = await grupoModel.apagar(Number(idMensagem), me);
  if (!antiga) return { ok: false, motivo: 'NAO_PERMITIDO' };
  apagarUpload(antiga.imagem);
  apagarUpload(antiga.audio);
  apagarUpload(antiga.video);
  return { ok: true };
}

function marcarLidas(me, idGrupo) { return grupoModel.marcarLidas(Number(idGrupo), me); }
function contarNaoLidasTotal(me) { return grupoModel.contarNaoLidasTotal(me); }

function previaUltima(r, me) {
  if (r.ult_apagada) return '🚫 Mensagem apagada';
  const corpo = r.ult_texto || (r.ult_imagem ? '📷 Foto' : r.ult_audio ? '🎤 Mensagem de voz' : r.ult_video ? '🎬 Vídeo' : '');
  if (r.ult_sistema) return corpo;
  const quem = r.ult_de === me ? 'Você' : primeiroNome({ nome: r.ult_nome });
  return `${quem}: ${corpo}`;
}

// Itens para a lista do Direct (misturados com as pessoas, ordenados pela última mensagem).
async function listarDoUsuario(me) {
  const rows = await grupoModel.listarDoUsuario(me);
  return rows.map((r) => ({
    ehGrupo: true,
    id_grupo: r.id_grupo,
    nome: r.nome,
    foto: r.foto,
    membrosN: r.membros_n,
    amostra: Array.isArray(r.amostra) ? r.amostra : [],
    naoLidas: r.nao_lidas || 0,
    // "minha: false" de propósito: o texto já vem com "Você:" quando é meu.
    ultima: r.ult_id ? { texto: previaUltima(r, me), criado_em: r.ult_em, minha: false } : null,
  }));
}

module.exports = {
  criar, abrir, enviar, listarConversa, adicionar, sair, renomear, definirFoto, removerMembro, editar, apagar,
  marcarLidas, contarNaoLidasTotal, listarDoUsuario, LIMITE, NOME_MAX,
};
