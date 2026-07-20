// Cria os dados iniciais: o usuário ADMINISTRADOR (bootstrap do sistema).
// Como só admins aprovam cadastros, é o seed que cria o primeiro admin.
// Uso:  npm run db:seed   (pode rodar várias vezes — não duplica)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const env = require('../config/env');

async function seed() {
  const nome = env.adminInicialNome;
  const usuario = env.adminInicialUsuario;
  const senha = env.adminInicialSenha;

  if (!senha) {
    throw new Error(
      'ADMIN_INICIAL_SENHA não definida. Configure uma senha forte no .env antes de rodar o seed.'
    );
  }

  const senhaHash = await bcrypt.hash(senha, env.bcryptRounds);

  // Cria o admin se ainda não existir esse login. Já entra APROVADO e ativo.
  // senha_provisoria = FALSE (a senha do admin master é definida por ele).
  const res = await db.query(
    `INSERT INTO usuarios (nome, usuario, senha_hash, tipo_usuario, status, ativo, senha_provisoria)
     VALUES ($1, $2, $3, 'ADMINISTRADOR', 'APROVADO', TRUE, FALSE)
     ON CONFLICT (lower(usuario)) WHERE usuario IS NOT NULL DO NOTHING
     RETURNING id_usuario`,
    [nome, usuario, senhaHash]
  );

  if (res.rowCount > 0) {
    console.log(`✓ Administrador criado (login: ${usuario}).`);
  } else {
    console.log(`• Administrador "${usuario}" já existe — nada a fazer.`);
  }

  console.log('\nSeed concluído!');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('ERRO no seed:', err.message);
    process.exit(1);
  });
