'use strict';

// Destaques do perfil (stories guardados em coleções). Tudo AJAX → JSON.
const express = require('express');
const ctrl = require('../controllers/destaques.controller');
const { exigeAutenticacao, exigeSenhaDefinitiva, bloquearAdmin } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(exigeAutenticacao, exigeSenhaDefinitiva, bloquearAdmin);

router.get('/painel', ctrl.getPainel);                         // meus destaques + meu arquivo (?story=ID marca onde já está)
router.get('/:id(\\d+)', ctrl.getAbrir);                        // stories do destaque, no formato do visualizador
router.post('/', ctrl.postCriar);                              // { titulo, stories: "1,2,3" }
router.post('/:id(\\d+)/stories', ctrl.postAdicionar);          // { id_story }
router.post('/:id(\\d+)/stories/:id_story(\\d+)/remover', ctrl.postTirar);
router.post('/:id(\\d+)/nome', ctrl.postRenomear);              // { titulo }
router.post('/:id(\\d+)/excluir', ctrl.postExcluir);

module.exports = router;
