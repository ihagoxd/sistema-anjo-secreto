'use strict';

/**
 * Regras dos Destaques: só o dono cria/edita; só entram stories dele; destaque vazio some.
 */
const destaqueModel = require('../models/destaque.model');
const storyModel = require('../models/story.model');
const usuarioModel = require('../models/usuario.model');

const MAX_TITULO = 30;
function limparTitulo(t) {
  return String(t || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TITULO);
}

async function doDono(idDestaque, meId) {
  const d = await destaqueModel.buscar(idDestaque);
  if (!d) return { erro: 'NAO_ENCONTRADO' };
  if (d.id_usuario !== meId) return { erro: 'SEM_PERMISSAO' };
  return { d };
}
async function storiesMeus(meId, ids) {
  const ok = [];
  for (const bruto of ids) {
    const id = Number(bruto);
    if (!id || ok.includes(id)) continue;
    const s = await storyModel.buscarPorId(id);
    if (s && s.id_usuario === meId) ok.push(id);
  }
  return ok;
}

// Lista do perfil
function listarDoUsuario(idUsuario) {
  return destaqueModel.listarDoUsuario(idUsuario);
}

// Dados para abrir o destaque no visualizador (mesmo formato do grupo de stories)
async function abrir(idDestaque, meId) {
  const d = await destaqueModel.buscar(idDestaque);
  if (!d) return null;
  const autor = await usuarioModel.buscarPorId(d.id_usuario);
  if (!autor) return null;
  const itens = await destaqueModel.listarStories(idDestaque, meId);
  if (!itens.length) return null;
  return {
    id_usuario: autor.id_usuario, nome: autor.nome, usuario: autor.usuario, foto_perfil: autor.foto_perfil,
    eu: autor.id_usuario === meId, tudoVisto: true,
    destaque: { id: d.id_destaque, titulo: d.titulo },
    itens: itens.map((s) => ({
      id_story: s.id_story, imagem: s.imagem, video: s.video, criado_em: s.criado_em,
      visto: s.visto, vistos: s.vistos, curti: s.curti, curtidas: s.curtidas, sobreposicoes: s.sobreposicoes || null,
    })),
  };
}

async function criar(meId, titulo, ids) {
  const t = limparTitulo(titulo);
  if (!t) return { ok: false, motivo: 'TITULO' };
  const stories = await storiesMeus(meId, ids || []);
  if (!stories.length) return { ok: false, motivo: 'VAZIO' };
  const d = await destaqueModel.criar(meId, t);
  for (const id of stories) await destaqueModel.adicionarStory(d.id_destaque, id);
  const lista = await destaqueModel.listarDoUsuario(meId);
  return { ok: true, destaque: lista.find((x) => x.id_destaque === d.id_destaque) || d };
}

async function adicionar(meId, idDestaque, idStory) {
  const r = await doDono(idDestaque, meId);
  if (r.erro) return { ok: false, motivo: r.erro };
  const ok = await storiesMeus(meId, [idStory]);
  if (!ok.length) return { ok: false, motivo: 'SEM_PERMISSAO' };
  await destaqueModel.adicionarStory(idDestaque, ok[0]);
  return { ok: true };
}

async function tirar(meId, idDestaque, idStory) {
  const r = await doDono(idDestaque, meId);
  if (r.erro) return { ok: false, motivo: r.erro };
  const resta = await destaqueModel.tirarStory(idDestaque, Number(idStory));
  if (!resta) await destaqueModel.excluir(idDestaque); // destaque vazio some (como no Instagram)
  return { ok: true, vazio: !resta };
}

async function renomear(meId, idDestaque, titulo) {
  const r = await doDono(idDestaque, meId);
  if (r.erro) return { ok: false, motivo: r.erro };
  const t = limparTitulo(titulo);
  if (!t) return { ok: false, motivo: 'TITULO' };
  await destaqueModel.renomear(idDestaque, t);
  return { ok: true, titulo: t };
}

async function excluir(meId, idDestaque) {
  const r = await doDono(idDestaque, meId);
  if (r.erro) return { ok: false, motivo: r.erro };
  await destaqueModel.excluir(idDestaque);
  return { ok: true };
}

// Folha "Destacar"/"Novo destaque": meus destaques (com marca se o story já está) + meu arquivo
async function painel(meId, idStory) {
  const destaques = await destaqueModel.listarDoUsuario(meId);
  const ja = idStory ? await destaqueModel.destaquesDoStory(Number(idStory)) : [];
  return {
    destaques: destaques.map((d) => Object.assign({ tem: ja.includes(d.id_destaque) }, d)),
    arquivo: await destaqueModel.arquivo(meId),
  };
}

module.exports = { MAX_TITULO, listarDoUsuario, abrir, criar, adicionar, tirar, renomear, excluir, painel };
