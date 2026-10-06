// Conexão com o PostgreSQL usando um "pool" de conexões.
// O pool reaproveita conexões abertas — mais eficiente do que abrir/fechar a cada consulta.
// Mesmo padrão do sistema-sugestoes (variáveis DB_*, TLS opcional).
require('dotenv').config();
const fs = require('fs');
const { Pool } = require('pg');
const { fuso } = require('./fuso');

// TLS na conexão com o banco (essencial em nuvem / banco gerenciado).
// DB_SSL=true liga; por padrão valida o certificado do servidor.
// Use DB_SSL_REJECT_UNAUTHORIZED=false só se o provedor exigir (menos seguro),
// ou aponte a CA confiável em DB_SSL_CA (caminho do arquivo .pem).
let ssl = false;
if (['true', 'require', '1'].includes((process.env.DB_SSL || '').toLowerCase())) {
  ssl = { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' };
  if (process.env.DB_SSL_CA) ssl.ca = fs.readFileSync(process.env.DB_SSL_CA);
}

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'anjo_secreto',
  ssl,
  // Fuso da sessão SQL igual ao da aplicação: CURRENT_DATE, ::date e afins
  // passam a significar "hoje em Brasília", não "hoje em UTC" (o servidor roda em UTC).
  options: `-c timezone=${fuso}`,
  // Conexões ficam abertas entre um clique e outro. O padrão do pg (fechar conexão
  // ociosa após 10 s) fazia quase TODA página pagar uma reconexão (+100–300 ms),
  // porque o uso do app é esparso. Mantém no mínimo 2 abertas e só descarta as
  // demais depois de 10 min paradas.
  min: 3,
  max: 10,
  idleTimeoutMillis: 10 * 60 * 1000,
  keepAlive: true,
});

// Aquece o pool no boot (abre N conexões e devolve): as primeiras páginas depois
// de um deploy/restart já saem rápidas, em vez de esperar o handshake com o banco.
async function aquecer(n = 2) {
  try {
    const clientes = await Promise.all(Array.from({ length: n }, () => pool.connect()));
    clientes.forEach((c) => c.release());
  } catch (err) {
    console.error('[db] não aqueceu o pool:', err.message);
  }
}

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do PostgreSQL:', err.message);
});

// Medição por requisição (ligada com PERF_LOG=1 no .env): cada consulta soma no
// contexto da requisição atual — o app.js imprime "GET /feed 120ms 14 consultas".
const { AsyncLocalStorage } = require('async_hooks');
const medicao = new AsyncLocalStorage();

// Consulta parametrizada: db.query('SELECT ... WHERE x = $1', [valor])
async function query(text, params) {
  const m = medicao.getStore();
  if (!m) return pool.query(text, params);
  const t0 = process.hrtime.bigint();
  try {
    return await pool.query(text, params);
  } finally {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    m.n += 1;
    m.ms += ms;
    if (ms >= (m.lenta || 20)) m.lentas.push(`${ms.toFixed(0)}ms ${text.replace(/\s+/g, ' ').trim().slice(0, 90)}`);
  }
}

// Cliente dedicado para TRANSAÇÕES (ex.: sorteio). Lembre de client.release() ao final.
function getClient() {
  return pool.connect();
}

// Testa a conectividade (usado no healthcheck e no boot).
async function testarConexao() {
  const res = await pool.query('SELECT 1 AS ok');
  return res.rows[0].ok === 1;
}

module.exports = { query, getClient, testarConexao, aquecer, pool, medicao };
