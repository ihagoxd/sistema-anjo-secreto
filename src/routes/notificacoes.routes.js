'use strict';

const express = require('express');
const ctrl = require('../controllers/notificacoes.controller');
const { exigeAutenticacao, exigeSenhaDefinitiva } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(exigeAutenticacao, exigeSenhaDefinitiva);

router.get('/', ctrl.getPagina);
router.get('/novas', ctrl.novas);
router.post('/ler-todas', ctrl.lerTodas);
router.get('/:id/abrir', ctrl.abrir);

module.exports = router;
