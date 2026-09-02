'use strict';

// Lado do usuário dos avisos: ver um aviso e marcar "Entendi".
const express = require('express');
const ctrl = require('../controllers/aviso.controller');
const { exigeAutenticacao, exigeSenhaDefinitiva } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(exigeAutenticacao, exigeSenhaDefinitiva);

router.get('/:id(\\d+)', ctrl.getVer);
router.post('/:id(\\d+)/visto', ctrl.postVisto);

module.exports = router;
