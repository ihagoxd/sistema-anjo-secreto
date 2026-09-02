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
  for (const u of alvos) await notificacaoService.notificarMencao(u.id_usuario, idAtor, idPost, texto);
}

// ---------- Enquetes (como no WhatsApp) ----------
const ENQ_MIN = 2;
const ENQ_MAX = 10;
const ENQ_OPCAO_MAX = 100;
const ENQ_PERGUNTA_MAX = 200;

function limparPergunta(p) {
  return String(p || '').trim().replace(/\s+/g, ' ').slice(0, ENQ_PERGUNTA_MAX);
}

// Normaliza a enquete vinda do formulário: pergunta obrigatória, opções sem vazias/repetidas, no máximo 10.
function normalizarEnquete(bruto) {
  if (!bruto) return { ok: true, enquete: null };
  const lista = (Array.isArray(bruto.opcoes) ? bruto.opcoes : [bruto.opcoes])
    .map((o) => String(o || '').trim().replace(/\s+/g, ' ').slice(0, ENQ_OPCAO_MAX)).filter(Boolean);
  const unicas = [];
  lista.forEach((o) => { if (!unicas.some((u) => u.toLowerCase() === o.toLowerCase())) unicas.push(o); });
  const pergunta = limparPergunta(bruto.pergunta);
  if (!unicas.length && !pergunta) return { ok: true, enquete: null };
  if (!pergunta) return { ok: false, motivo: 'ENQUETE_SEM_PERGUNTA' };
  if (unicas.length < ENQ_MIN) return { ok: false, motivo: 'ENQUETE_POUCAS' };
  return { ok: true, enquete: { pergunta, opcoes: unicas.slice(0, ENQ_MAX), multipla: !!bruto.multipla } };
}

// Autor edita a pergunta da enquete depois de publicada.
async function editarPergunta(idPost, idUsuario, pergunta) {
  const post = await postModel.buscarPorId(idPost);
  if (!post) return { ok: false, motivo: 'NAO_ENCONTRADO' };
  if (post.id_usuario !== idUsuario) return { ok: false, motivo: 'SEM_PERMISSAO' };
  const p = limparPergunta(pergunta);
  if (!p) return { ok: false, motivo: 'ENQUETE_SEM_PERGUNTA' };
  await postModel.atualizarPergunta(idPost, p);
  return { ok: true, pergunta: p };
}

// Linhas do banco (uma por opção) → objeto pronto para a view/JSON, com porcentagens.
// Resposta única: % sobre o total de votos. Várias respostas: % sobre quem votou (pessoas).
function montarEnquete(linhas) {
  if (!linhas || !linhas.length) return null;
  const multipla = !!linhas[0].enquete_multipla;
  const pessoas = new Set();
  let somaVotos = 0;
  linhas.forEach((l) => { somaVotos += l.votos; (l.votantes || []).forEach((v) => pessoas.add(v.usuario)); });
  const base = multipla ? pessoas.size : somaVotos;
  const opcoes = linhas.map((l) => ({
    id_opcao: l.id_opcao, texto: l.texto, votos: l.votos, votei: !!l.votei,
    votantes: l.votantes || [], pct: base ? Math.round((l.votos / base) * 100) : 0,
  }));
  const votei = opcoes.some((o) => o.votei);
  return { multipla, opcoes, total: pessoas.size, votei, pergunta: linhas[0].enquete_pergunta || null, id_autor: linhas[0].id_autor };
}

// Anexa "enquete" a cada post que tem uma.
async function anexarEnquetes(posts, idUsuarioAtual) {
  const ids = posts.filter((p) => p.tem_enquete).map((p) => p.id_post);
  if (!ids.length) return;
  const linhas = await postModel.listarEnquetesDeVarios(ids, idUsuarioAtual);
  const porPost = {};
  linhas.forEach((l) => { (porPost[l.id_post] = porPost[l.id_post] || []).push(l); });
  posts.forEach((p) => { p.enquete = montarEnquete(porPost[p.id_post]); });
}

async function buscarEnquete(idPost, idUsuarioAtual) {
  return montarEnquete(await postModel.listarEnquetesDeVarios([Number(idPost)], idUsuarioAtual));
}

// Votar/desvotar numa opção. Devolve a enquete atualizada + "votou em" do usuário.
async function votar(idPost, idOpcao, idUsuario) {
  idPost = Number(idPost); idOpcao = Number(idOpcao);
  const op = await postModel.buscarOpcao(idOpcao);
  if (!op || op.id_post !== idPost) return { ok: false, motivo: 'NAO_ENCONTRADA' };
  const atual = await buscarEnquete(idPost, idUsuario);
  if (!atual) return { ok: false, motivo: 'NAO_ENCONTRADA' };
  await postModel.alternarVoto(idPost, idOpcao, idUsuario, atual.multipla);
  const enquete = await buscarEnquete(idPost, idUsuario);
  const votou = await postModel.votoDoUsuario(idPost, idUsuario);
  return { ok: true, enquete, votou };
}

async function criarPost(idUsuario, texto, imagemPath, videoPath = null, colaboradorId = null, enqueteBruta = null) {
  const t = String(texto || '').trim();
  const e = normalizarEnquete(enqueteBruta);
  if (!e.ok) return e;
  if (!t && !imagemPath && !videoPath && !e.enquete) return { ok: false, motivo: 'VAZIO' };
  if (t.length > LIMITE_TEXTO) return { ok: false, motivo: 'LONGO' };

  // Colaboradores (post em dupla/trio, "fulano e +N"): valida cada um; inválidos são ignorados.
  const colaboradores = [];
  for (const bruto of String(colaboradorId || '').split(',')) {
    const cid = Number(bruto.trim());
    if (!cid || cid === Number(idUsuario) || colaboradores.includes(cid)) continue;
    const c = await usuarioModel.buscarPorId(cid);
    if (c && c.status === 'APROVADO' && c.ativo && c.tipo_usuario === 'PARTICIPANTE') colaboradores.push(c.id_usuario);
  }

  const novo = await postModel.criar({
    idUsuario, texto: t || null, imagem: imagemPath || null, video: videoPath || null,
    idColaborador: colaboradores[0] || null, enqueteMultipla: !!(e.enquete && e.enquete.multipla),
    enquetePergunta: e.enquete ? e.enquete.pergunta : null,
  });
  if (e.enquete) await postModel.criarOpcoes(novo.id_post, e.enquete.opcoes);
  if (colaboradores.length) {
    await postModel.adicionarColaboradores(novo.id_post, colaboradores);
    for (const cid of colaboradores) await notificacaoService.notificarMencao(cid, idUsuario, novo.id_post, t, 'colab');
  }
  await notificarMencoes(t, idUsuario, novo.id_post);
  return { ok: true, id_post: novo.id_post };
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
    await notificacaoService.notificarCurtida(post.id_usuario, idUsuario, idPost, post.imagem);
  }
  const total = await postModel.contarCurtidas(idPost);
  // Quem aparece na linha "Curtido por fulano e outras pessoas" (o curtidor mais recente)
  const primeiros = await postModel.listarCurtidores(idPost, 1);
  return { ok: true, curtiu: !curtiu, total, curtidor: primeiros.length ? primeiros[0].usuario : null };
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
    await notificacaoService.notificarRepost(post.id_usuario, idUsuario, idPost, post.imagem);
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
  await notificacaoService.notificarComentario(post.id_usuario, idUsuario, idPost, t, post.imagem);
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
  anexarEnquetes, buscarEnquete, votar, montarEnquete, editarPergunta,
};
