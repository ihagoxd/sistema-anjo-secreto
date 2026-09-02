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
