'use strict';

const storyService = require('../services/story.service');

// Publica um story (foto OU vídeo, mesma qualidade do upload — sem recompressão).
async function postCriar(req, res, next) {
  try {
    const um = (campo) => {
      const f = req.files && req.files[campo] && req.files[campo][0];
      return f ? `/uploads/${f.filename}` : null;
    };
    const r = await storyService.publicar(req.session.usuario.id_usuario, um('imagem'), um('video'));
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

module.exports = { postCriar, getDados, postVisto, postRemover };
