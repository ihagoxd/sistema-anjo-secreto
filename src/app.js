'use strict';

/**
 * Monta a aplicação Express (sem subir o servidor).
 * Separado do server.js para permitir testes com supertest.
 */
const path = require('path');
const express = require('express');

const env = require('./config/env');
const { hbs, viewsDir } = require('./config/handlebars');
const { testarConexao } = require('./config/db');
const sessao = require('./config/session');
const { cspNonce, helmetMiddleware, permissionsPolicy, limiteGeral } = require('./config/security');
const { contexto } = require('./middlewares/auth.middleware');
const { carregarContextoApp } = require('./middlewares/contextoApp.middleware');
const { attachCsrf, verifyCsrf } = require('./middlewares/csrf.middleware');
const { naoEncontrado, erroInterno } = require('./middlewares/errorHandler.middleware');

const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const participanteRoutes = require('./routes/participante.routes');
const feedRoutes = require('./routes/feed.routes');
const contaRoutes = require('./routes/conta.routes');
const mensagensRoutes = require('./routes/mensagens.routes');
const notificacoesRoutes = require('./routes/notificacoes.routes');
const avisosRoutes = require('./routes/avisos.routes');

const app = express();
app.set('trust proxy', 1); // para req.ip / cookie secure atrás de proxy

// --- HTTP puro atrás do proxy → manda pra HTTPS ---
// Em produção o site é servido pelo Cloudflare (túnel). Se alguém chega por
// http://anjo... (link antigo, digitou sem https, "Always Use HTTPS" desligado
// no painel), o cookie de sessão (secure) nunca chega e o login "não pega".
// Só age quando o proxy avisa X-Forwarded-Proto: http — acesso direto na LAN
// (sem proxy) continua funcionando como sempre.
if (env.servirHttps) {
  app.use((req, res, next) => {
    const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    if (proto !== 'http') return next();
    const destino = `https://${req.headers.host}${req.originalUrl}`;
    // 301 para GET/HEAD; 308 preserva método e corpo para o resto.
    return res.redirect(req.method === 'GET' || req.method === 'HEAD' ? 301 : 308, destino);
  });
}

// --- View engine (Handlebars) ---
app.engine('handlebars', hbs);
app.set('view engine', 'handlebars');
app.set('views', viewsDir);

// "Carimbo de versão" dos assets (muda a cada boot/deploy) para quebrar o cache
// do navegador — assim CSS/JS novos aparecem sem precisar de refresh forçado.
app.locals.assetVer = Date.now().toString(36);

// --- Segurança de cabeçalhos (antes de tudo) ---
app.use(cspNonce);            // gera o nonce da CSP (antes do helmet)
app.use(helmetMiddleware());
app.use(permissionsPolicy);

// --- Arquivos estáticos (não passam por sessão/rate limit) ---
// Uploads têm nome único (carimbo + aleatório) e nunca mudam de conteúdo depois de
// publicados: o navegador pode guardar por 1 ano sem perguntar de novo. Assim a foto
// do perfil/post/story só baixa UMA vez por aparelho.
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'), {
  maxAge: '365d', immutable: true, index: false, etag: true,
}));
// CSS e JS levam ?v=assetVer no HTML (muda a cada deploy), então o navegador pode
// guardá-los por 30 dias SEM revalidar: navegar entre páginas vira só o HTML — antes,
// cada clique conferia css + js + fonte com o servidor (3 idas e voltas pelo Cloudflare).
// Fonte e imagens do app mudam raramente: 30 dias também (trocar o nome do arquivo se mudar).
const estaticoLongo = { maxAge: '30d', immutable: true, index: false, etag: true };
app.use('/css', express.static(path.join(__dirname, 'public', 'css'), estaticoLongo));
app.use('/js', express.static(path.join(__dirname, 'public', 'js'), estaticoLongo));
app.use('/fonts', express.static(path.join(__dirname, 'public', 'fonts'), estaticoLongo));
app.use('/img', express.static(path.join(__dirname, 'public', 'img'), { maxAge: '7d', index: false, etag: true }));
// O resto (sw.js, manifest, favicon) continua revalidando a cada uso.
app.use(express.static(path.join(__dirname, 'public')));

// Páginas HTML NUNCA são cacheadas: sem isso o navegador guardava o HTML antigo,
// que apontava pro ui.js?v=VELHO — e as atualizações não chegavam mesmo com F5.
// (Os assets ficam de fora: o carimbo ?v= do assetVer já cuida da versão deles.)
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});

// --- Parsers ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- Medição de desempenho (PERF_LOG=1): tempo total e consultas de cada página ---
// Só para diagnosticar lentidão; desligado não custa nada.
if (process.env.PERF_LOG === '1') {
  const { medicao } = require('./config/db');
  app.use((req, res, next) => {
    const t0 = process.hrtime.bigint();
    medicao.run({ n: 0, ms: 0, lentas: [], lenta: Number(process.env.PERF_LENTA_MS) || 20 }, () => {
      res.on('finish', () => {
        const m = medicao.getStore() || { n: 0, ms: 0, lentas: [] };
        const total = Number(process.hrtime.bigint() - t0) / 1e6;
        if (/\.(css|js|png|jpg|svg|woff2|webmanifest)(\?|$)/.test(req.path)) return;
        console.log(`[perf] ${req.method} ${req.originalUrl} ${res.statusCode} ${total.toFixed(0)}ms · ${m.n} consultas (${m.ms.toFixed(0)}ms no banco)${m.lentas.length ? '\n   lentas: ' + m.lentas.join('\n           ') : ''}`);
      });
      next();
    });
  });
}

// --- Sessão + contexto de view + CSRF ---
app.use(sessao);
app.use(contexto);     // expõe usuário logado + flash
app.use(attachCsrf);   // garante token CSRF na sessão e em res.locals
app.use(limiteGeral()); // rate limit geral das rotas dinâmicas
app.use(verifyCsrf);   // valida token em POST/PUT/PATCH/DELETE
app.use(carregarContextoApp); // notificações (badge/recentes) + aniversariantes

// Healthcheck: verifica também a conectividade com o banco.
app.get('/health', async (req, res) => {
  const saude = { status: 'ok', ambiente: env.nodeEnv, banco: 'desconhecido' };
  try {
    await testarConexao();
    saude.banco = 'ok';
    res.status(200).json(saude);
  } catch (err) {
    saude.status = 'degradado';
    saude.banco = 'indisponivel';
    saude.erro = env.isProducao ? undefined : err.message;
    res.status(503).json(saude);
  }
});

// A porta de entrada do sistema é o login (não há home de marketing).
app.get('/', (req, res) => res.redirect('/login'));

// --- Rotas ---
app.use('/', authRoutes);
app.use('/', feedRoutes);
app.use('/', contaRoutes);
app.use('/mensagens', mensagensRoutes);
app.use('/notificacoes', notificacoesRoutes);
app.use('/avisos', avisosRoutes);
app.use('/admin', adminRoutes);
app.use('/participante', participanteRoutes);

// --- Tratamento de erros (sempre por último) ---
app.use(naoEncontrado);
app.use(erroInterno);

module.exports = app;
