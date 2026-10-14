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
router.get('/estado', ctrl.getEstado);
router.get('/anjo', ctrl.getAnjo);
router.get('/protegido', ctrl.getProtegido);
router.get('/u/:id', ctrl.getDireta);
// Grupos do escritório
router.get('/g/:id([0-9]+)', ctrl.getGrupo);
router.get('/g/:id([0-9]+)/item', ctrl.getGrupoItem);
router.post('/grupos', ctrl.postCriarGrupo);                    // JSON { nome, membros: [ids] }
router.post('/g/:id([0-9]+)/membros', ctrl.postGrupoMembros);  // JSON { membros: [ids] }
router.post('/g/:id([0-9]+)/sair', ctrl.postGrupoSair);
router.post('/g/:id([0-9]+)/nome', ctrl.postGrupoNome);        // JSON { nome }

// Tempo real: "digitando…" e "li as mensagens" (viram eventos SSE para o outro lado)
router.post('/:canal(anjo|protegido)/digitando', ctrl.postDigitando);
router.post('/:canal(u|g)/:id([0-9]+)/digitando', ctrl.postDigitando);
router.post('/:canal(anjo|protegido)/lidas', ctrl.postLidas);
router.post('/:canal(u|g)/:id([0-9]+)/lidas', ctrl.postLidas);
// Tema da conversa (só DM do escritório) — JSON { tema }
router.post('/u/:id([0-9]+)/tema', ctrl.postTema);

// Envio (com imagem opcional)
router.post('/anjo', midiaMsg, ctrl.postAnjo);
router.post('/protegido', midiaMsg, ctrl.postProtegido);
router.post('/u/:id', midiaMsg, ctrl.postDireta);
router.post('/g/:id([0-9]+)', midiaMsg, ctrl.postGrupo);

// Edição e exclusão (AJAX)
router.post('/editar', ctrl.postEditar);
router.post('/apagar', ctrl.postApagar);

module.exports = router;
