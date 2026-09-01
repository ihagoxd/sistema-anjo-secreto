'use strict';

const postService = require('../services/post.service');
const postModel = require('../models/post.model');
const usuarioModel = require('../models/usuario.model');
const preferenciaService = require('../services/preferencia.service');
const storyService = require('../services/story.service');
const { montarGostos } = require('../config/gostos');

function ehAdmin(req) {
  return req.session.usuario.tipo_usuario === 'ADMINISTRADOR';
}

// Agrupa os comentários por post e anexa a cada post.
function anexarComentarios(posts, comentarios) {
  const porPost = {};
  comentarios.forEach((c) => { (porPost[c.id_post] = porPost[c.id_post] || []).push(c); });
  posts.forEach((p) => { p.comentariosLista = porPost[p.id_post] || []; });
}

// Marca em cada post se o AUTOR tem story ativo (anel no avatar do card).
function anotarStories(posts, aneis) {
  posts.forEach((p) => {
    p.temStory = !!aneis[p.id_usuario];
    p.storyVisto = !!(aneis[p.id_usuario] && aneis[p.id_usuario].tudoVisto);
  });
}

async function getFeed(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const posts = await postService.listarFeed(me);
    const comentarios = await postModel.listarComentariosDeVarios(posts.map((p) => p.id_post));
    anexarComentarios(posts, comentarios);
    let equipe = await usuarioModel.listarAprovados(me, 30);
    // Anéis dos stories (estilo Instagram): dourado = tem story não visto; cinza = sem story ou tudo visto
    const aneis = await storyService.resumoAneis(me);
    equipe = equipe.map((u) => ({
      ...u,
      temStory: !!aneis[u.id_usuario],
      storyVisto: !!(aneis[u.id_usuario] && aneis[u.id_usuario].tudoVisto),
    }));
    anotarStories(posts, aneis);
    const sugestoes = equipe.slice(0, 5); // sidebar segue em ordem alfabética
    // Fileira de stories: quem postou vai pra FRENTE (não vistos primeiro, depois já
    // vistos), quem não tem story fica atrás — como no Instagram.
    equipe.sort((a, b) => {
      const ka = a.temStory ? (a.storyVisto ? 1 : 0) : 2;
      const kb = b.temStory ? (b.storyVisto ? 1 : 0) : 2;
      return ka - kb;
    });
    const meuAnel = aneis[me] || null;
    res.render('feed/index', {
      titulo: 'Mural',
      posts,
      limite: postService.LIMITE_TEXTO,
      equipe,
      sugestoes,
      tenhoStory: !!meuAnel,
    });
  } catch (err) {
    next(err);
  }
}

async function postCriar(req, res, next) {
  try {
    const um = (campo) => {
      const f = (req.files && req.files[campo] && req.files[campo][0]) || null;
      return f ? '/uploads/' + f.filename : null;
    };
    const r = await postService.criarPost(req.session.usuario.id_usuario, req.body.texto, um('imagem'), um('video'), req.body.colaborador || null);
    if (!r.ok) req.session.flash = { erro: r.motivo === 'LONGO' ? 'Texto longo demais.' : 'Escreva algo ou adicione uma foto.' };
    else req.session.flash = { sucesso: 'Publicado! ✨' };
    res.redirect('/feed');
  } catch (err) {
    next(err);
  }
}

// Curtir/descurtir (AJAX → JSON).
async function postCurtir(req, res, next) {
  try {
    const r = await postService.alternarCurtida(req.params.id_post, req.session.usuario.id_usuario);
    if (!r.ok) return res.status(404).json({ erro: 'Post não encontrado.' });
    res.json({ curtiu: r.curtiu, total: r.total, curtidor: r.curtidor });
  } catch (err) {
    next(err);
  }
}

// Quem curtiu (AJAX → JSON) — alimenta a folha "Curtidas" do post.
async function getCurtidas(req, res, next) {
  try {
    const lista = await postService.listarCurtidores(req.params.id_post);
    if (!lista) return res.status(404).json({ erro: 'Post não encontrado.' });
    res.json(lista);
  } catch (err) {
    next(err);
  }
}

// Repostar/desfazer (AJAX → JSON).
async function postRepost(req, res, next) {
  try {
    const r = await postService.alternarRepost(req.params.id_post, req.session.usuario.id_usuario);
    if (!r.ok) return res.status(404).json({ erro: 'Post não encontrado.' });
    res.json({ repostou: r.repostou, total: r.total });
  } catch (err) {
    next(err);
  }
}

async function postComentar(req, res, next) {
  try {
    const r = await postService.comentar(req.params.id_post, req.session.usuario.id_usuario, req.body.texto);
    // Pedido via AJAX (comentário inline no feed): responde em JSON, sem recarregar.
    const querJson = req.xhr || (req.get('Accept') || '').includes('application/json');
    if (querJson) {
      if (!r.ok) return res.status(400).json({ ok: false });
      const u = req.session.usuario;
      return res.json({
        ok: true,
        comentario: {
          id_comentario: r.idComentario,
          texto: r.texto,
          id_usuario: u.id_usuario,
          nome: u.nome,
          usuario: u.usuario,
          foto_perfil: u.foto_perfil || null,
        },
      });
    }
    if (!r.ok) req.session.flash = { erro: 'Não foi possível comentar.' };
    res.redirect(req.get('Referer') || '/feed');
  } catch (err) {
    next(err);
  }
}

async function postRemover(req, res, next) {
  try {
    const r = await postService.removerPost(req.params.id_post, req.session.usuario.id_usuario, ehAdmin(req));
    req.session.flash = r.ok ? { sucesso: 'Publicação removida.' } : { erro: 'Não foi possível remover.' };
    res.redirect(req.get('Referer') || '/feed');
  } catch (err) {
    next(err);
  }
}

async function postRemoverComentario(req, res, next) {
  try {
    await postService.removerComentario(req.params.id_comentario, req.session.usuario.id_usuario, ehAdmin(req));
    res.redirect(req.get('Referer') || '/feed');
  } catch (err) {
    next(err);
  }
}

async function getPost(req, res, next) {
  try {
    const post = await postService.buscarPost(req.params.id_post, req.session.usuario.id_usuario);
    if (!post) {
      req.session.flash = { erro: 'Publicação não encontrada.' };
      return res.redirect('/feed');
    }
    anotarStories([post], await storyService.resumoAneis(req.session.usuario.id_usuario));
    res.render('feed/post', { titulo: 'Publicação', posts: [post], detalhe: true });
  } catch (err) {
    next(err);
  }
}

async function renderPerfil(req, res, aba) {
  const me = req.session.usuario.id_usuario;
  const dados = await postService.perfilPublico(req.params.usuario, me);
  if (!dados) {
    req.session.flash = { erro: 'Perfil não encontrado.' };
    return res.redirect('/feed');
  }
  let posts = dados.posts;
  let gostos = null;
  let fotosGosta = null;
  if (aba === 'gostos') {
    const [prefs, fotos] = await Promise.all([
      preferenciaService.buscarPreferenciasPorUsuario(dados.alvo.id_usuario),
      preferenciaService.listarFotos(dados.alvo.id_usuario),
    ]);
    gostos = montarGostos(prefs);
    fotosGosta = fotos;
  } else if (aba === 'reposts') {
    posts = await postService.listarRepostados(dados.alvo.id_usuario, me);
  }
  // Comentários (para expandir inline nos cards do perfil, igual ao mural).
  const comentarios = await postModel.listarComentariosDeVarios(posts.map((p) => p.id_post));
  anexarComentarios(posts, comentarios);
  const aneis = await storyService.resumoAneis(me);
  anotarStories(posts, aneis);
  // Anel + toque no avatar do CABEÇALHO do perfil abre o story (segurar amplia a foto)
  dados.alvo.temStory = !!aneis[dados.alvo.id_usuario];
  dados.alvo.storyVisto = !!(aneis[dados.alvo.id_usuario] && aneis[dados.alvo.id_usuario].tudoVisto);
  res.render('feed/perfil', {
    titulo: dados.alvo.nome, alvo: dados.alvo, posts, aba, gostos, fotosGosta,
    numPublicacoes: dados.posts.length, pagina: 'perfil',
  });
}

const getPerfil = (req, res, next) => renderPerfil(req, res, 'publicacoes').catch(next);
const getPerfilReposts = (req, res, next) => renderPerfil(req, res, 'reposts').catch(next);
const getPerfilGostos = (req, res, next) => renderPerfil(req, res, 'gostos').catch(next);

// Feed ao vivo (polling leve): quantos posts novos desde o id X + estado dos anéis de story.
async function getNovidades(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const depois = parseInt(req.query.depois, 10) || 0;
    const novosPosts = await postModel.contarNovosDesde(depois);
    const aneis = await storyService.resumoAneis(me);
    res.json({
      novosPosts,
      euTenho: !!aneis[me],
      aneis: Object.keys(aneis).map((id) => ({ id_usuario: Number(id), tudoVisto: !!aneis[id].tudoVisto })),
    });
  } catch (err) {
    next(err);
  }
}

// Pesquisa de usuários (AJAX → JSON) — tela de busca estilo Instagram.
// Sem termo, devolve os cadastrados (as "Sugestões" da tela), sem o próprio usuário.
async function getBusca(req, res, next) {
  try {
    const q = String(req.query.q || '').trim();
    const lista = await usuarioModel.buscarUsuarios(q, q ? 20 : 31);
    res.json(lista.filter((u) => u.usuario !== req.session.usuario.usuario).slice(0, q ? 20 : 30));
  } catch (err) {
    next(err);
  }
}

// Autocomplete de @menções (AJAX → JSON).
async function getMencoes(req, res, next) {
  try {
    const itens = await usuarioModel.buscarParaMencao(req.query.q, 6);
    res.json(itens);
  } catch (err) {
    next(err);
  }
}

module.exports = { getFeed, getPost, postCriar, postCurtir, getCurtidas, postRepost, postComentar, postRemover, postRemoverComentario, getPerfil, getPerfilReposts, getPerfilGostos, getMencoes, getBusca, getNovidades };
