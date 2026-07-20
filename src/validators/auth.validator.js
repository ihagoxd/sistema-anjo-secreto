'use strict';

/**
 * Validação/sanitização das entradas de autenticação (express-validator).
 * É a primeira linha; o service ainda revalida (defesa em profundidade) e
 * trata o caso de usuário duplicado.
 */
const { body, validationResult } = require('express-validator');

const regrasRegistro = [
  body('nome').trim().isLength({ min: 2, max: 150 }).withMessage('Informe seu nome completo.'),
  body('usuario')
    .trim()
    .toLowerCase()
    .matches(/^[a-z0-9._-]{3,80}$/)
    .withMessage('Usuário inválido: 3 a 80 caracteres (letras, números, ponto, hífen ou _).'),
  body('senha').isLength({ min: 6, max: 200 }).withMessage('A senha deve ter ao menos 6 caracteres.'),
  body('confirmarSenha').custom((v, { req }) => v === req.body.senha).withMessage('As senhas não conferem.'),
];

// Se houver erro, re-renderiza o cadastro com a 1ª mensagem (mantém o que foi digitado).
function validarRegistro(req, res, next) {
  const erros = validationResult(req);
  if (erros.isEmpty()) return next();
  return res.status(400).render('auth/registrar', {
    layout: 'auth',
    titulo: 'Criar conta',
    nome: req.body.nome,
    usuario: req.body.usuario,
    erro: erros.array()[0].msg,
  });
}

module.exports = { regrasRegistro, validarRegistro };
