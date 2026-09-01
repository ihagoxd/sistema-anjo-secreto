'use strict';

/**
 * Regras do Mural (rede social interna).
 */
const postModel = require('../models/post.model');
const usuarioModel = require('../models/usuario.model');
const notificacaoService = require('./notificacao.service');
const { extrair } = require('../config/mencoes');
const { apagarUpload } = require('../config/upload');

const LIMITE_TEXTO = 1000;

// Notifica cada pessoa @mencionada no texto (menos o próprio autor).
async function notificarMencoes(texto, idAtor, idPost) {
  const usernames = extrair(texto);
  if (!usernames.length) return;
  const alvos = await usuarioModel.resolverMencoes(usernames);
  for (const u of alvos) await notificacaoService.notificarMencao(u.id_usuario, idAtor, idPost);
}

async function criarPost(idUsuario, texto, imagemPath, videoPath = null) {
  const t = String(texto || '').trim();
  if (!t && !imagemPath && !videoPath) return { ok: false, motivo: 'VAZIO' };
  if (t.length > LIMITE_TEXTO) return { ok: false, motivo: 'LONGO' };
  const novo = await postModel.criar({ idUsuario, texto: t || null, imagem: imagemPath || null, video: videoPath || null });
  await notificarMencoes(t, idUsuario, novo.id_post);
  return { ok: true };
}

function listarFeed(idUsuarioAtual) {
  return postModel.listarFeed(idUsuarioAtual, 60);
}

async function buscarPost(idPost, idUsuarioAtual) {
  const post = await postModel.buscarFeedUm(idPost, idUsuarioAtual);
  if (!post) return null;
  post.comentariosLista = await postModel.listarComentarios(idPost);
  return post;
}

// Perfil público: dados do usuário + posts dele.
async function perfilPublico(usuario, idUsuarioAtual) {
  const alvo = await usuarioModel.buscarPorUsuario(usuario);
  if (!alvo || alvo.status !== 'APROVADO') return null;
  const posts = await postModel.listarPorUsuario(alvo.id_usuario, idUsuarioAtual);
  const humor = await usuarioModel.buscarHumorHoje(alvo.id_usuario);
  return {
    alvo: {
      id_usuario: alvo.id_usuario, nome: alvo.nome, usuario: alvo.usuario,
      foto_perfil: alvo.foto_perfil, tipo_usuario: alvo.tipo_usuario, bio: alvo.bio, humor,
      data_nascimento: alvo.data_nascimento, criado_em: alvo.criado_em,
    },
    posts,
  };
}

// Curtir/descurtir (toggle). Retorna estado + total.
async function alternarCurtida(idPost, idUsuario) {
  const post = await postModel.buscarPorId(idPost);
  if (!post) return { ok: false };
  const curtiu = await postModel.jaCurtiu(idPost, idUsuario);
  if (curtiu) await postModel.descurtir(idPost, idUsuario);
  else {
    await postModel.curtir(idPost, idUsuario);
    await notificacaoService.notificarCurtida(post.id_usuario, idUsuario, idPost);
  }
  const total = await postModel.contarCurtidas(idPost);
  return { ok: true, curtiu: !curtiu, total };
}

// Quem curtiu o post (para a folha "Curtidas").
async function listarCurtidores(idPost) {
  const post = await postModel.buscarPorId(idPost);
  if (!post) return null;
  return postModel.listarCurtidores(idPost);
}

// Repostar/desfazer (toggle). Retorna estado + total. Notifica o autor original.
async function alternarRepost(idPost, idUsuario) {
  const post = await postModel.buscarPorId(idPost);
  if (!post) return { ok: false };
  const jah = await postModel.jaRepostou(idPost, idUsuario);
  if (jah) {
    await postModel.desfazerRepost(idPost, idUsuario);
  } else {
    await postModel.repostar(idPost, idUsuario);
    await notificacaoService.notificarRepost(post.id_usuario, idUsuario, idPost);
  }
  const total = await postModel.contarReposts(idPost);
  return { ok: true, repostou: !jah, total };
}

function listarRepostados(idAutor, idUsuarioAtual) {
  return postModel.listarRepostadosPor(idAutor, idUsuarioAtual);
}

async function comentar(idPost, idUsuario, texto) {
  const post = await postModel.buscarPorId(idPost);
  if (!post) return { ok: false, motivo: 'NAO_ENCONTRADO' };
  const t = String(texto || '').trim();
  if (!t) return { ok: false, motivo: 'VAZIO' };
  if (t.length > 500) return { ok: false, motivo: 'LONGO' };
  const novo = await postModel.adicionarComentario(idPost, idUsuario, t);
  await notificacaoService.notificarComentario(post.id_usuario, idUsuario, idPost);
  await notificarMencoes(t, idUsuario, idPost);
  return { ok: true, idComentario: novo.id_comentario, texto: t };
}

function listarComentarios(idPost) {
  return postModel.listarComentarios(idPost);
}

// Remover post (dono ou admin). Apaga a imagem do disco.
async function removerPost(idPost, idUsuario, ehAdmin) {
  const post = await postModel.buscarPorId(idPost);
  if (!post) return { ok: false, motivo: 'NAO_ENCONTRADO' };
  if (post.id_usuario !== idUsuario && !ehAdmin) return { ok: false, motivo: 'SEM_PERMISSAO' };
  if (post.imagem) apagarUpload(post.imagem);
  await postModel.remover(idPost);
  return { ok: true };
}

async function removerComentario(idComentario, idUsuario, ehAdmin) {
  const c = await postModel.buscarComentario(idComentario);
  if (!c) return { ok: false, motivo: 'NAO_ENCONTRADO' };
  if (c.id_usuario !== idUsuario && !ehAdmin) return { ok: false, motivo: 'SEM_PERMISSAO' };
  await postModel.removerComentario(idComentario);
  return { ok: true, idPost: c.id_post };
}

module.exports = {
  LIMITE_TEXTO,
  criarPost, listarFeed, buscarPost, perfilPublico,
  alternarCurtida, listarCurtidores, alternarRepost, listarRepostados, comentar, listarComentarios,
  removerPost, removerComentario,
};
