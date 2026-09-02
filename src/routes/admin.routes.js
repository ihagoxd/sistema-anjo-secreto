'use strict';

const express = require('express');
const adminCtrl = require('../controllers/admin.controller');
const usuarioCtrl = require('../controllers/usuario.controller');
const campanhaCtrl = require('../controllers/campanha.controller');
const participanteCtrl = require('../controllers/participanteAdmin.controller');
const sorteioCtrl = require('../controllers/sorteio.controller');
const avisoCtrl = require('../controllers/aviso.controller');
const { exigeAutenticacao, exigeAdmin, exigeSenhaDefinitiva } = require('../middlewares/auth.middleware');

const router = express.Router();

// Todas as rotas /admin exigem login + senha definitiva + perfil admin.
router.use(exigeAutenticacao, exigeSenhaDefinitiva, exigeAdmin);

router.get('/', adminCtrl.getDashboard);

// Logs (auditoria)
router.get('/logs', adminCtrl.getLogs);

// Aprovação de cadastros
router.get('/aprovacoes', adminCtrl.getAprovacoes);
router.post('/aprovacoes/:id_usuario/aprovar', adminCtrl.postAprovar);
router.post('/aprovacoes/:id_usuario/recusar', adminCtrl.postRecusar);

// Gestão de usuários
router.get('/usuarios', usuarioCtrl.getLista);
router.post('/usuarios', usuarioCtrl.postCriar);
router.get('/usuarios/:id_usuario/editar', usuarioCtrl.getEditar);
router.post('/usuarios/:id_usuario/editar', usuarioCtrl.postEditar);
router.post('/usuarios/:id_usuario/inativar', usuarioCtrl.postInativar);
router.post('/usuarios/:id_usuario/ativar', usuarioCtrl.postAtivar);
router.post('/usuarios/:id_usuario/excluir', usuarioCtrl.postExcluir);
router.post('/usuarios/:id_usuario/resetar-senha', usuarioCtrl.postResetarSenha);

// Avisos (cards da administração na tela de todo mundo)
router.get('/avisos', avisoCtrl.getAdmin);
router.post('/avisos', avisoCtrl.postSalvar);
router.post('/avisos/:id(\\d+)/alternar', avisoCtrl.postAlternar);
router.post('/avisos/:id(\\d+)/excluir', avisoCtrl.postExcluir);

// Campanhas
router.get('/campanhas', campanhaCtrl.getLista);
router.post('/campanhas', campanhaCtrl.postCriar);
router.get('/campanhas/:id_campanha', campanhaCtrl.getDetalhe);
router.post('/campanhas/:id_campanha/editar', campanhaCtrl.postEditar);
router.post('/campanhas/:id_campanha/encerrar', campanhaCtrl.postEncerrar);
router.post('/campanhas/:id_campanha/apagar', campanhaCtrl.postApagar);

// Participantes da campanha
router.post('/campanhas/:id_campanha/participantes', participanteCtrl.postAdicionar);
router.post('/campanhas/:id_campanha/participantes/:id_participante/remover', participanteCtrl.postRemover);

// Sorteio
router.post('/campanhas/:id_campanha/sorteio/iniciar', sorteioCtrl.postIniciar);
router.post('/campanhas/:id_campanha/sorteio/refazer', sorteioCtrl.postRefazer);

// Tela emergencial: revelar o sorteio (gera log obrigatório no POST)
router.get('/campanhas/:id_campanha/revelar', adminCtrl.getRevelar);
router.post('/campanhas/:id_campanha/revelar', adminCtrl.postRevelar);

module.exports = router;
