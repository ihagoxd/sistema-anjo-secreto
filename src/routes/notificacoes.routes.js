'use strict';

const express = require('express');
const ctrl = require('../controllers/notificacoes.controller');
const { exigeAutenticacao, exigeSenhaDefinitiva } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(exigeAutenticacao, exigeSenhaDefinitiva);

router.get('/', ctrl.getPagina);
router.get('/lista', ctrl.lista);
router.get('/novas', ctrl.novas);
router.get('/stream', ctrl.stream);
router.post('/ler-todas', ctrl.lerTodas);
router.post('/limpar', ctrl.limpar);
router.post('/testar', ctrl.testar);

router.get('/preferencias', ctrl.getPreferencias);
router.post('/preferencias', ctrl.salvarPreferencias);
router.post('/push/inscrever', ctrl.pushInscrever);
router.post('/push/cancelar', ctrl.pushCancelar);

router.get('/:id(\\d+)/abrir', ctrl.abrir);
router.post('/:id(\\d+)/ler', ctrl.ler);
router.post('/:id(\\d+)/excluir', ctrl.excluir);

module.exports = router;
