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
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do PostgreSQL:', err.message);
});

// Consulta parametrizada: db.query('SELECT ... WHERE x = $1', [valor])
function query(text, params) {
  return pool.query(text, params);
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

module.exports = { query, getClient, testarConexao, pool };
