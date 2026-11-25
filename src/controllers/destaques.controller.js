'use strict';

const destaqueService = require('../services/destaque.service');

const MSG = {
  TITULO: 'Dê um nome ao destaque.',
  VAZIO: 'Escolha pelo menos um story.',
  NAO_ENCONTRADO: 'Destaque não encontrado.',
  SEM_PERMISSAO: 'Só quem criou pode mexer neste destaque.',
};
const responder = (res, r) => (r.ok ? res.json(r) : res.status(r.motivo === 'NAO_ENCONTRADO' ? 404 : 400).json({ ok: false, erro: MSG[r.motivo] || 'Não foi possível.' }));
const me = (req) => req.session.usuario.id_usuario;
const lista = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => Number(x)).filter(Boolean);

async function getPainel(req, res, next) {
  try { res.json(await destaqueService.painel(me(req), req.query.story)); } catch (err) { next(err); }
}
async function getAbrir(req, res, next) {
  try {
    const g = await destaqueService.abrir(Number(req.params.id), me(req));
    if (!g) return res.status(404).json({ ok: false, erro: MSG.NAO_ENCONTRADO });
    res.json(g);
  } catch (err) { next(err); }
}
async function postCriar(req, res, next) {
  try { responder(res, await destaqueService.criar(me(req), req.body.titulo, lista(req.body.stories))); } catch (err) { next(err); }
}
async function postAdicionar(req, res, next) {
  try { responder(res, await destaqueService.adicionar(me(req), Number(req.params.id), Number(req.body.id_story))); } catch (err) { next(err); }
}
async function postTirar(req, res, next) {
  try { responder(res, await destaqueService.tirar(me(req), Number(req.params.id), Number(req.params.id_story))); } catch (err) { next(err); }
}
async function postRenomear(req, res, next) {
  try { responder(res, await destaqueService.renomear(me(req), Number(req.params.id), req.body.titulo)); } catch (err) { next(err); }
}
async function postExcluir(req, res, next) {
  try { responder(res, await destaqueService.excluir(me(req), Number(req.params.id))); } catch (err) { next(err); }
}

module.exports = { getPainel, getAbrir, postCriar, postAdicionar, postTirar, postRenomear, postExcluir };
