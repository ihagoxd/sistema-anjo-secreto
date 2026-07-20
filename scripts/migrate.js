// ============================================================
//  Executor de MIGRATIONS versionadas (node-pg-migrate).
//
//  As migrations ficam em /migrations e evoluem o banco de forma
//  rastreável (cada mudança é um arquivo numerado, aplicado uma única
//  vez e registrado na tabela "pgmigrations").
//
//  Uso:
//    npm run migrate           → aplica todas as pendentes (up)
//    npm run migrate:down      → desfaz a última (down, 1 passo)
//    node scripts/migrate.js up 2      → aplica só as 2 próximas
//    node scripts/migrate.js down 3    → desfaz as 3 últimas
//
//  Reaproveita as MESMAS variáveis de ambiente do app (DB_HOST etc.).
// ============================================================
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { runner } = require('node-pg-migrate');

// Conexão idêntica à de src/config/db.js (inclui TLS opcional).
let ssl = false;
if (['true', 'require', '1'].includes((process.env.DB_SSL || '').toLowerCase())) {
  ssl = { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' };
  if (process.env.DB_SSL_CA) ssl.ca = fs.readFileSync(process.env.DB_SSL_CA);
}

const databaseUrl = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'anjo_secreto',
  ssl,
};

async function main() {
  const direction = (process.argv[2] || 'up').toLowerCase() === 'down' ? 'down' : 'up';
  const countArg = Number(process.argv[3]);
  // up: aplica todas as pendentes; down: desfaz só a última (padrão seguro).
  const count = Number.isFinite(countArg) ? countArg : direction === 'down' ? 1 : Infinity;

  const migrados = await runner({
    databaseUrl,
    dir: path.join(__dirname, '..', 'migrations'),
    migrationsTable: 'pgmigrations',
    direction,
    count,
    verbose: true,
  });

  if (!migrados.length) {
    console.log('• Nenhuma migration pendente — banco já está atualizado.');
  } else {
    console.log(`✓ ${migrados.length} migration(s) ${direction === 'up' ? 'aplicada(s)' : 'desfeita(s)'}.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nERRO nas migrations:', err.message);
    process.exit(1);
  });
