// ============================================================
//  Proteção CSRF — padrão "synchronizer token".
//  Um token aleatório é guardado na sessão e precisa voltar em
//  toda requisição que altera estado (POST/PUT/PATCH/DELETE),
//  no campo oculto _csrf do form ou no header X-CSRF-Token.
// ============================================================
const crypto = require('crypto');

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

function gerarToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Garante um token na sessão e o expõe para as views (res.locals.csrfToken).
function attachCsrf(req, res, next) {
  if (req.session && !req.session.csrfToken) {
    req.session.csrfToken = gerarToken();
  }
  res.locals.csrfToken = req.session ? req.session.csrfToken : '';
  next();
}

// Compara dois tokens em tempo constante (evita timing attack).
function tokensConferem(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch (e) {
    return false;
  }
}

function tokenDaRequisicao(req) {
  return (
    (req.body && req.body._csrf) ||
    req.get('x-csrf-token') ||
    req.get('csrf-token') ||
    ''
  );
}

function rejeitar(res) {
  return res.status(403).render('erros/403', {
    titulo: 'Ação bloqueada',
    mensagem: 'Sua sessão expirou ou o formulário é inválido. Recarregue a página e tente de novo.',
  });
}

// Bloqueia requisições de escrita sem token válido.
// Em multipart/form-data o corpo só é lido pelo multer (na rota), então aqui
// pulamos e validamos depois com verifyCsrfAposUpload.
function verifyCsrf(req, res, next) {
  if (METODOS_SEGUROS.has(req.method)) return next();

  const ct = req.get('content-type') || '';
  if (ct.startsWith('multipart/form-data')) return next();

  const enviado = tokenDaRequisicao(req);
  const naSessao = req.session && req.session.csrfToken;
  if (naSessao && tokensConferem(enviado, naSessao)) return next();
  return rejeitar(res);
}

// Validação para usar DEPOIS do multer em rotas multipart.
function verifyCsrfAposUpload(req, res, next) {
  if (METODOS_SEGUROS.has(req.method)) return next();
  const enviado = tokenDaRequisicao(req);
  const naSessao = req.session && req.session.csrfToken;
  if (naSessao && tokensConferem(enviado, naSessao)) return next();
  return rejeitar(res);
}

module.exports = { attachCsrf, verifyCsrf, verifyCsrfAposUpload };
