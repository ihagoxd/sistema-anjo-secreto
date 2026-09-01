// ============================================================
//  Segurança HTTP: Helmet (CSP com nonce), Permissions-Policy e rate limit.
//  Montado aqui e "ligado" no app.js. Mesmo padrão do sistema-sugestoes.
// ============================================================
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const env = require('./env');

// ------------------------------------------------------------
//  Nonce por requisição: permite manter uma CSP forte mesmo com os
//  <script> inline do tema/loader no layout (sem 'unsafe-inline').
//  Precisa rodar ANTES do helmet.
// ------------------------------------------------------------
function cspNonce(req, res, next) {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
}

// ------------------------------------------------------------
//  Helmet + Content-Security-Policy
//  - scripts: só do próprio site + inline com nonce
//  - estilos: próprio site (+ inline por causa de pequenos style="" nos templates)
//  - imagens: próprio site e data: (SVG/favicon e a seta dos selects em data:)
// ------------------------------------------------------------
function helmetMiddleware() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: env.servirHttps ? [] : null,
      },
    },
    // HSTS e upgrade-insecure-requests só fazem sentido sob HTTPS.
    hsts: env.servirHttps ? { maxAge: 15552000, includeSubDomains: true } : false,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'same-origin' },
  });
}

// Desliga APIs sensíveis que o app não usa — mas MICROFONE e CÂMERA ficam
// liberados para o próprio site (mensagem de voz e câmera do chat/story).
function permissionsPolicy(req, res, next) {
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(self), camera=(self), payment=(), usb=()');
  next();
}

// ------------------------------------------------------------
//  Rate limit GERAL — generoso (protege contra abuso de rotas dinâmicas).
// ------------------------------------------------------------
function limiteGeral() {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    limit: Number(process.env.RATE_LIMIT_MAX) || 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });
}

// ------------------------------------------------------------
//  Rate limit do LOGIN — barra força-bruta sem punir quem acerta.
//  Por IP; logins bem-sucedidos não contam (skipSuccessfulRequests).
// ------------------------------------------------------------
function limiteLogin() {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    limit: env.loginMaxTentativas, // nº de FALHAS toleradas por IP
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (req, res) => {
      req.session.flash = { erro: 'Muitas tentativas de login. Aguarde alguns minutos e tente de novo.' };
      res.status(429).redirect('/login');
    },
  });
}

// Limita o auto-cadastro (evita spam de solicitações).
function limiteRegistro() {
  return rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    limit: Number(process.env.RATE_LIMIT_REGISTRO) || 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      req.session.flash = { erro: 'Muitos cadastros a partir deste local. Tente novamente mais tarde.' };
      res.status(429).redirect('/registrar');
    },
  });
}

module.exports = { cspNonce, helmetMiddleware, permissionsPolicy, limiteGeral, limiteLogin, limiteRegistro };
