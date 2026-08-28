'use strict';

const express = require('express');
const ctrl = require('../controllers/mensagens.controller');
const { exigeAutenticacao, exigeSenhaDefinitiva, bloquearAdmin } = require('../middlewares/auth.middleware');
const { verifyCsrfAposUpload } = require('../middlewares/csrf.middleware');
const { uploadMsg, conferirAssinaturas } = require('../config/upload');

const router = express.Router();
router.use(exigeAutenticacao, exigeSenhaDefinitiva, bloquearAdmin);

// Recebe a mídia opcional da mensagem: imagem OU áudio de voz (multipart).
function receberMidia(req, res, next) {
  uploadMsg.fields([{ name: 'imagem', maxCount: 1 }, { name: 'audio', maxCount: 1 }, { name: 'video', maxCount: 1 }])(req, res, function (err) {
    if (err) {
      req.session.flash = { erro: err.message || 'Falha no envio do arquivo.' };
      return res.redirect(req.get('Referer') || '/mensagens');
    }
    next();
  });
}
const midiaMsg = [receberMidia, conferirAssinaturas, verifyCsrfAposUpload];

// Inbox + conversas abertas
router.get('/', ctrl.getInbox);
router.get('/anjo', ctrl.getAnjo);
router.get('/protegido', ctrl.getProtegido);
router.get('/u/:id', ctrl.getDireta);

// Envio (com imagem opcional)
router.post('/anjo', midiaMsg, ctrl.postAnjo);
router.post('/protegido', midiaMsg, ctrl.postProtegido);
router.post('/u/:id', midiaMsg, ctrl.postDireta);

// Edição (AJAX)
router.post('/editar', ctrl.postEditar);

module.exports = router;
