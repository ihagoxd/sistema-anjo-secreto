'use strict';

const storyService = require('../services/story.service');

// Publica um story (foto OU vídeo, mesma qualidade do upload — sem recompressão).
async function postCriar(req, res, next) {
  try {
    const um = (campo) => {
      const f = req.files && req.files[campo] && req.files[campo][0];
      return f ? `/uploads/${f.filename}` : null;
    };
    const r = await storyService.publicar(req.session.usuario.id_usuario, um('imagem'), um('video'), req.body.mencao || null);
    if (req.get('X-Requested-With') === 'fetch') {
      if (!r.ok) return res.status(400).json({ erro: 'Escolha uma foto ou um vídeo para o story.' });
      return res.json({ ok: true, id_story: r.id_story });
    }
    if (!r.ok) req.session.flash = { erro: 'Escolha uma foto ou um vídeo para o story.' };
    res.redirect('/feed');
  } catch (err) {
    next(err);
  }
}

// Todos os stories ativos agrupados por pessoa (JSON — alimenta o visualizador).
async function getDados(req, res, next) {
  try {
    res.json(await storyService.listarAgrupado(req.session.usuario.id_usuario));
  } catch (err) {
    next(err);
  }
}

// Marca um story como visto (AJAX).
async function postVisto(req, res, next) {
  try {
    const r = await storyService.marcarVisto(req.session.usuario.id_usuario, req.params.id_story);
    if (!r.ok) return res.status(404).json({ erro: 'Story não encontrado.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// Quem viu o story (JSON) — só o autor (ou admin) recebe a lista.
async function getVistos(req, res, next) {
  try {
    const ehAdmin = req.session.usuario.tipo_usuario === 'ADMINISTRADOR';
    const lista = await storyService.vistosDe(req.session.usuario.id_usuario, req.params.id_story, ehAdmin);
    if (!lista) return res.status(403).json({ erro: 'Sem permissão.' });
    res.json(lista);
  } catch (err) {
    next(err);
  }
}

// Curtir/descurtir um story (AJAX).
async function postCurtir(req, res, next) {
  try {
    const r = await storyService.alternarCurtida(req.session.usuario.id_usuario, req.params.id_story);
    if (!r.ok) return res.status(404).json({ erro: 'Story não encontrado.' });
    res.json({ curti: r.curti, total: r.total });
  } catch (err) {
    next(err);
  }
}

// Responder ao story → DM para o autor (AJAX).
async function postResponder(req, res, next) {
  try {
    const r = await storyService.responder(req.session.usuario.id_usuario, req.params.id_story, req.body.texto);
    if (!r.ok) return res.status(400).json({ erro: 'Não foi possível responder.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// Encaminhar o story para alguém no Direct (AJAX).
async function postEncaminhar(req, res, next) {
  try {
    const r = await storyService.encaminhar(req.session.usuario.id_usuario, req.params.id_story, req.body.para);
    if (!r.ok) return res.status(400).json({ erro: 'Não foi possível encaminhar.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// Marcar alguém num story JÁ publicado (AJAX — ícone @ no visualizador).
async function postMarcar(req, res, next) {
  try {
    const r = await storyService.marcarPessoa(req.session.usuario.id_usuario, req.params.id_story, req.body.pessoa);
    if (!r.ok) return res.status(400).json({ erro: 'Não foi possível marcar.' });
    res.json({ ok: true, usuario: r.usuario });
  } catch (err) {
    next(err);
  }
}

// Repostar um story em que fui marcado (AJAX) — usado no caminho de VÍDEO.
async function postRepostar(req, res, next) {
  try {
    const r = await storyService.repostar(req.session.usuario.id_usuario, req.params.id_story);
    if (!r.ok) return res.status(r.motivo === 'SEM_PERMISSAO' ? 403 : 404).json({ erro: 'Não foi possível repostar.' });
    res.json({ ok: true, id_story: r.id_story });
  } catch (err) {
    next(err);
  }
}

// Apaga um story (autor ou admin) — AJAX.
async function postRemover(req, res, next) {
  try {
    const ehAdmin = req.session.usuario.tipo_usuario === 'ADMINISTRADOR';
    const r = await storyService.remover(req.session.usuario.id_usuario, req.params.id_story, ehAdmin);
    if (!r.ok) return res.status(r.motivo === 'SEM_PERMISSAO' ? 403 : 404).json({ erro: 'Não foi possível apagar.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { postCriar, getDados, postVisto, postRemover, postCurtir, postResponder, postEncaminhar, getVistos, postRepostar, postMarcar };
