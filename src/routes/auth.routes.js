'use strict';

const express = require('express');
const ctrl = require('../controllers/auth.controller');
const { somenteVisitante, exigeAutenticacao } = require('../middlewares/auth.middleware');
const { limiteLogin, limiteRegistro } = require('../config/security');
const { regrasRegistro, validarRegistro } = require('../validators/auth.validator');

const router = express.Router();

router.get('/login', somenteVisitante, ctrl.getLogin);
router.post('/login', somenteVisitante, limiteLogin(), ctrl.postLogin);

router.get('/registrar', somenteVisitante, ctrl.getRegistrar);
router.post('/registrar', somenteVisitante, limiteRegistro(), regrasRegistro, validarRegistro, ctrl.postRegistrar);

router.get('/trocar-senha', exigeAutenticacao, ctrl.getTrocarSenha);
router.post('/trocar-senha', exigeAutenticacao, ctrl.postTrocarSenha);

router.post('/logout', exigeAutenticacao, ctrl.postLogout);

module.exports = router;
