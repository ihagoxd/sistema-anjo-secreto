'use strict';

const express = require('express');
const ctrl = require('../controllers/participante.controller');
const { exigeAutenticacao, exigeSenhaDefinitiva } = require('../middlewares/auth.middleware');
const { verifyCsrfAposUpload } = require('../middlewares/csrf.middleware');
const { upload, conferirAssinaturas } = require('../config/upload');

const router = express.Router();

router.use(exigeAutenticacao, exigeSenhaDefinitiva);

// Recebe a foto de perfil (1) + a galeria de fotos das preferências (até 6 por envio).
const camposImagem = upload.fields([{ name: 'foto_perfil', maxCount: 1 }, { name: 'fotos', maxCount: 6 }]);
function receberImagens(req, res, next) {
  camposImagem(req, res, function (err) {
    if (err) {
      req.session.flash = { erro: err.message || 'Falha no envio da imagem.' };
      return res.redirect(req.get('Referer') || '/participante/preferencias');
    }
    next();
  });
}

router.get('/', ctrl.getDashboard);
router.get('/protegido', ctrl.getProtegido);
router.get('/preferencias', ctrl.getPreferencias);

// Perfil (multipart: CSRF validado após o multer)
router.post('/perfil', receberImagens, conferirAssinaturas, verifyCsrfAposUpload, ctrl.postPerfil);
router.post('/perfil/foto/remover', ctrl.postRemoverFotoPerfil);
router.post('/perfil/fotos/:id_foto/remover', ctrl.postRemoverFoto);
router.post('/perfil/fotos/:id_foto/legenda', ctrl.postLegendaFoto);

// Mensagens migraram para o "Direct" compartilhado em /mensagens.
router.get('/mensagens', (req, res) => res.redirect('/mensagens'));

module.exports = router;
