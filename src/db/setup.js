// Cria o banco de dados (se ainda não existir) e aplica o schema.sql.
// Uso:  npm run db:setup
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DB_NAME = process.env.DB_NAME || 'anjo_secreto';

const baseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

async function ensureDatabase() {
  // Conecta no banco padrão "postgres" para poder criar o nosso banco.
  const client = new Client({ ...baseConfig, database: 'postgres' });
  await client.connect();
  const res = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
  if (res.rowCount === 0) {
    // Nome do banco não pode ser parametrizado; já validamos que vem do .env.
    await client.query(`CREATE DATABASE "${DB_NAME}"`);
    console.log(`✓ Banco "${DB_NAME}" criado.`);
  } else {
    console.log(`• Banco "${DB_NAME}" já existe.`);
  }
  await client.end();
}

async function applySchema() {
  const client = new Client({ ...baseConfig, database: DB_NAME });
  await client.connect();
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await client.query(sql);
  console.log('✓ Schema base aplicado (tabelas criadas/atualizadas).');
  await client.end();
}

// Aplica as migrations versionadas (/migrations) por cima do schema base.
// Cada mudança nova do banco mora numa migration — ver scripts/migrate.js.
async function applyMigrations() {
  const { runner } = require('node-pg-migrate');
  let ssl = false;
  if (['true', 'require', '1'].includes((process.env.DB_SSL || '').toLowerCase())) {
    ssl = { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' };
    if (process.env.DB_SSL_CA) ssl.ca = fs.readFileSync(process.env.DB_SSL_CA);
  }
  const aplicadas = await runner({
    databaseUrl: { ...baseConfig, database: DB_NAME, ssl },
    dir: path.join(__dirname, '..', '..', 'migrations'),
    migrationsTable: 'pgmigrations',
    direction: 'up',
    count: Infinity,
  });
  console.log(`✓ Migrations aplicadas (${aplicadas.length} nova(s)).`);
}

(async () => {
  try {
    await ensureDatabase();
    await applySchema();
    await applyMigrations();
    console.log('\nBanco pronto! Rode "npm run db:seed" para criar o administrador inicial.');
    process.exit(0);
  } catch (err) {
    console.error('\nERRO ao preparar o banco:', err.message);
    process.exit(1);
  }
})();
