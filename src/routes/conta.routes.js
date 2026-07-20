'use strict';

const express = require('express');
const ctrl = require('../controllers/conta.controller');
const { exigeAutenticacao, exigeSenhaDefinitiva, bloquearAdmin } = require('../middlewares/auth.middleware');
const { verifyCsrfAposUpload } = require('../middlewares/csrf.middleware');
const { upload, conferirAssinaturas } = require('../config/upload');

const router = express.Router();
const guard = [exigeAutenticacao, exigeSenhaDefinitiva, bloquearAdmin];

const receberFoto = (req, res, next) => {
  upload.single('foto_perfil')(req, res, function (err) {
    if (err) { req.session.flash = { erro: err.message || 'Falha no envio da imagem.' }; return res.redirect('/conta'); }
    next();
  });
};

router.get('/conta', guard, ctrl.getConta);
router.post('/conta', guard, receberFoto, conferirAssinaturas, verifyCsrfAposUpload, ctrl.postConta);
router.post('/conta/foto/remover', guard, ctrl.postRemoverFoto);
router.post('/conta/humor', guard, ctrl.postHumor);

module.exports = router;
