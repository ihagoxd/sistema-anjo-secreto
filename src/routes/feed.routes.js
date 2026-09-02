'use strict';

const express = require('express');
const ctrl = require('../controllers/feed.controller');
const storiesCtrl = require('../controllers/stories.controller');
const { exigeAutenticacao, exigeSenhaDefinitiva, bloquearAdmin } = require('../middlewares/auth.middleware');
const { verifyCsrfAposUpload } = require('../middlewares/csrf.middleware');
const { uploadMsg, conferirAssinaturas } = require('../config/upload');

const router = express.Router();
const guard = [exigeAutenticacao, exigeSenhaDefinitiva, bloquearAdmin];

// Mídia opcional do post: imagem OU vídeo gravado na câmera
const receberImagem = (req, res, next) => {
  uploadMsg.fields([{ name: 'imagem', maxCount: 1 }, { name: 'video', maxCount: 1 }])(req, res, function (err) {
    if (err) { req.session.flash = { erro: err.message || 'Falha no envio do arquivo.' }; return res.redirect('/feed'); }
    next();
  });
};

router.get('/feed', guard, ctrl.getFeed);
router.get('/feed/novidades', guard, ctrl.getNovidades);
router.post('/feed', guard, receberImagem, conferirAssinaturas, verifyCsrfAposUpload, ctrl.postCriar);
router.post('/feed/:id_post/curtir', guard, ctrl.postCurtir);
router.get('/feed/:id_post/curtidas', guard, ctrl.getCurtidas);
router.post('/feed/:id_post/repostar', guard, ctrl.postRepost);
router.post('/feed/:id_post/votar', guard, ctrl.postVotar);
router.get('/feed/:id_post/enquete', guard, ctrl.getEnquete);
router.post('/feed/:id_post/comentar', guard, ctrl.postComentar);
router.post('/feed/:id_post/remover', guard, ctrl.postRemover);
router.post('/feed/comentarios/:id_comentario/remover', guard, ctrl.postRemoverComentario);

// Stories (estilo Instagram): publicar, listar para o visualizador, marcar visto, apagar
const receberStory = (req, res, next) => {
  uploadMsg.fields([{ name: 'imagem', maxCount: 1 }, { name: 'video', maxCount: 1 }])(req, res, function (err) {
    if (err) { req.session.flash = { erro: err.message || 'Falha no envio do arquivo.' }; return res.redirect('/feed'); }
    next();
  });
};
router.post('/stories', guard, receberStory, conferirAssinaturas, verifyCsrfAposUpload, storiesCtrl.postCriar);
router.get('/stories/dados', guard, storiesCtrl.getDados);
router.post('/stories/:id_story/visto', guard, storiesCtrl.postVisto);
router.get('/stories/:id_story/vistos', guard, storiesCtrl.getVistos);
router.post('/stories/:id_story/curtir', guard, storiesCtrl.postCurtir);
router.post('/stories/:id_story/responder', guard, storiesCtrl.postResponder);
router.post('/stories/:id_story/encaminhar', guard, storiesCtrl.postEncaminhar);
router.post('/stories/:id_story/repostar', guard, storiesCtrl.postRepostar);
router.post('/stories/:id_story/marcar', guard, storiesCtrl.postMarcar);
router.post('/stories/:id_story/remover', guard, storiesCtrl.postRemover);

router.get('/mencoes', guard, ctrl.getMencoes);
router.get('/buscar', guard, ctrl.getBusca);
router.get('/p/:id_post', guard, ctrl.getPost);
router.get('/u/:usuario', guard, ctrl.getPerfil);
router.get('/u/:usuario/reposts', guard, ctrl.getPerfilReposts);
router.get('/u/:usuario/gostos', guard, ctrl.getPerfilGostos);

module.exports = router;
