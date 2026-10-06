'use strict';

/**
 * Acesso ao banco para a entidade "usuarios".
 * Todas as queries são parametrizadas (evita SQL Injection).
 */
const db = require('../config/db');

const COLUNAS = `id_usuario, nome, usuario, email, tipo_usuario, status, ativo, senha_provisoria, foto_perfil, perfil_completo, bio, data_nascimento, criado_em`;

// Busca pelo login (case-insensitive). Inclui o hash da senha (uso interno do login).
async function buscarPorUsuario(usuario) {
  const res = await db.query(
    `SELECT ${COLUNAS}, senha_hash FROM usuarios WHERE lower(usuario) = lower($1)`,
    [usuario]
  );
  return res.rows[0] || null;
}

async function buscarPorId(idUsuario) {
  const res = await db.query(`SELECT ${COLUNAS} FROM usuarios WHERE id_usuario = $1`, [idUsuario]);
  return res.rows[0] || null;
}

// Lista usuários para o admin, com busca por nome/usuário e filtro de situação:
//   filtro: 'todos' | 'pendentes' | 'aprovados' | 'recusados' | 'inativos' | 'admins'
// Pendentes vêm primeiro (precisam de ação), depois em ordem alfabética.
async function listarTodos({ busca, filtro } = {}) {
  const termo = busca && busca.trim() ? `%${busca.trim()}%` : null;
  const cond = {
    pendentes: `status = 'PENDENTE'`,
    aprovados: `status = 'APROVADO' AND ativo = TRUE`,
    recusados: `status = 'RECUSADO'`,
    inativos: `ativo = FALSE`,
    admins: `tipo_usuario = 'ADMINISTRADOR'`,
  }[filtro] || 'TRUE';
  const res = await db.query(
    `SELECT ${COLUNAS} FROM usuarios
      WHERE ($1::text IS NULL OR nome ILIKE $1 OR usuario ILIKE $1)
        AND ${cond}
      ORDER BY (status = 'PENDENTE') DESC, lower(nome) ASC`,
    [termo]
  );
  return res.rows;
}

// Contagens para os filtros da tela de usuários (chips com número).
async function contarResumo() {
  const res = await db.query(
    `SELECT COUNT(*)::int AS todos,
            COUNT(*) FILTER (WHERE status = 'PENDENTE')::int AS pendentes,
            COUNT(*) FILTER (WHERE status = 'APROVADO' AND ativo = TRUE)::int AS aprovados,
            COUNT(*) FILTER (WHERE status = 'RECUSADO')::int AS recusados,
            COUNT(*) FILTER (WHERE ativo = FALSE)::int AS inativos,
            COUNT(*) FILTER (WHERE tipo_usuario = 'ADMINISTRADOR')::int AS admins
       FROM usuarios`
  );
  return res.rows[0];
}

// Cria um cadastro vindo do auto-registro: PARTICIPANTE, status PENDENTE.
async function criarCadastroPendente({ nome, usuario, senhaHash }) {
  const res = await db.query(
    `INSERT INTO usuarios (nome, usuario, senha_hash, tipo_usuario, status, ativo, senha_provisoria)
     VALUES ($1, $2, $3, 'PARTICIPANTE', 'PENDENTE', TRUE, FALSE)
     RETURNING ${COLUNAS}`,
    [nome, usuario, senhaHash]
  );
  return res.rows[0];
}

// Cria um usuário pelo admin: já APROVADO e ativo, com senha provisória.
async function criar({ nome, usuario, senhaHash, tipoUsuario }) {
  const res = await db.query(
    `INSERT INTO usuarios (nome, usuario, senha_hash, tipo_usuario, status, ativo, senha_provisoria)
     VALUES ($1, $2, $3, $4, 'APROVADO', TRUE, TRUE)
     RETURNING ${COLUNAS}`,
    [nome, usuario, senhaHash, tipoUsuario]
  );
  return res.rows[0];
}

async function atualizar(idUsuario, { nome, usuario, tipoUsuario }) {
  const res = await db.query(
    `UPDATE usuarios SET nome = $2, usuario = $3, tipo_usuario = $4
      WHERE id_usuario = $1 RETURNING ${COLUNAS}`,
    [idUsuario, nome, usuario, tipoUsuario]
  );
  return res.rows[0];
}

// Ativa/inativa o usuário E espelha nas campanhas abertas (rascunho/em andamento):
// o participante inativo fica fora do próximo sorteio/refazer e das contagens.
async function definirAtivo(idUsuario, ativo) {
  await db.query(`UPDATE usuarios SET ativo = $2 WHERE id_usuario = $1`, [idUsuario, ativo]);
  await db.query(
    `UPDATE participantes p SET ativo = $2
       FROM campanhas c
      WHERE c.id_campanha = p.id_campanha AND p.id_usuario = $1 AND c.status <> 'ENCERRADA'`,
    [idUsuario, ativo]
  );
}

// Derruba TODAS as sessões abertas do usuário (inativado, excluído, senha redefinida,
// tipo alterado): a mudança vale na hora, sem esperar a sessão expirar.
// Nunca lança — se a tabela de sessão ainda não existir, só avisa no console.
async function derrubarSessoes(idUsuario) {
  try {
    const res = await db.query(
      `DELETE FROM session WHERE (sess #>> '{usuario,id_usuario}')::int = $1`,
      [idUsuario]
    );
    return res.rowCount;
  } catch (err) {
    console.error('[usuario] não derrubou sessões:', err.message);
    return 0;
  }
}

async function atualizarFoto(idUsuario, caminho) {
  await db.query(`UPDATE usuarios SET foto_perfil = $2 WHERE id_usuario = $1`, [idUsuario, caminho]);
}

async function marcarPerfilCompleto(idUsuario) {
  await db.query(`UPDATE usuarios SET perfil_completo = TRUE WHERE id_usuario = $1`, [idUsuario]);
}

async function atualizarBio(idUsuario, bio) {
  await db.query(`UPDATE usuarios SET bio = $2 WHERE id_usuario = $1`, [idUsuario, bio]);
}

async function atualizarNome(idUsuario, nome) {
  await db.query(`UPDATE usuarios SET nome = $2 WHERE id_usuario = $1`, [idUsuario, nome]);
}

// data: 'YYYY-MM-DD' ou null.
async function atualizarNascimento(idUsuario, data) {
  await db.query(`UPDATE usuarios SET data_nascimento = $2 WHERE id_usuario = $1`, [idUsuario, data || null]);
}

// Aniversariantes de HOJE (aprovados e ativos), comparando dia/mês.
async function aniversariantesHoje() {
  const res = await db.query(
    `SELECT id_usuario, nome, usuario, foto_perfil, data_nascimento
       FROM usuarios
      WHERE status = 'APROVADO' AND ativo = TRUE AND data_nascimento IS NOT NULL
        AND EXTRACT(MONTH FROM data_nascimento) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(DAY   FROM data_nascimento) = EXTRACT(DAY   FROM CURRENT_DATE)
      ORDER BY lower(nome) ASC`
  );
  return res.rows;
}

// Equipe: usuários aprovados e ativos (para a fila de "stories" e sugestões).
// `humor` só é retornado quando definido HOJE (status do dia zera à meia-noite).
async function listarAprovados(excluindoId, limite = 30) {
  const res = await db.query(
    `SELECT id_usuario, nome, usuario, foto_perfil,
            CASE WHEN humor_data = CURRENT_DATE THEN humor END AS humor
       FROM usuarios
      WHERE status = 'APROVADO' AND ativo = TRUE
        AND tipo_usuario = 'PARTICIPANTE'
        AND ($1::int IS NULL OR id_usuario <> $1)
      ORDER BY (foto_perfil IS NOT NULL) DESC, lower(nome) ASC
      LIMIT $2`,
    [excluindoId || null, limite]
  );
  return res.rows;
}

// Status do dia (humor) do próprio usuário — null se não definido hoje.
async function buscarHumorHoje(idUsuario) {
  const res = await db.query(
    `SELECT CASE WHEN humor_data = CURRENT_DATE THEN humor END AS humor
       FROM usuarios WHERE id_usuario = $1`,
    [idUsuario]
  );
  return res.rows[0] ? res.rows[0].humor : null;
}

// Define (ou limpa, com humor=null) o status do dia.
async function atualizarHumor(idUsuario, humor) {
  await db.query(
    `UPDATE usuarios
        SET humor = $2, humor_data = CASE WHEN $2::varchar IS NULL THEN NULL ELSE CURRENT_DATE END
      WHERE id_usuario = $1`,
    [idUsuario, humor]
  );
}

// Autocomplete de @menção: aprovados/ativos por username ou nome.
async function buscarParaMencao(termo, limite = 6) {
  const t = `${String(termo || '').trim()}%`;
  const res = await db.query(
    `SELECT usuario, nome, foto_perfil FROM usuarios
      WHERE status = 'APROVADO' AND ativo = TRUE AND usuario IS NOT NULL
        AND (usuario ILIKE $1 OR nome ILIKE ('%' || $1))
      ORDER BY (usuario ILIKE $1) DESC, lower(nome) ASC
      LIMIT $2`,
    [t, limite]
  );
  return res.rows;
}

// Pesquisa de usuários (tela de busca): casa em QUALQUER parte do nome ou do @usuario;
// quem começa com o termo vem primeiro.
async function buscarUsuarios(termo, limite = 20) {
  const t = String(termo || '').trim();
  const res = await db.query(
    `SELECT id_usuario, usuario, nome, foto_perfil FROM usuarios
      WHERE status = 'APROVADO' AND ativo = TRUE AND usuario IS NOT NULL
        AND (usuario ILIKE $1 OR nome ILIKE $1)
      ORDER BY (usuario ILIKE $2 OR nome ILIKE $2) DESC, lower(nome) ASC
      LIMIT $3`,
    [`%${t}%`, `${t}%`, limite]
  );
  return res.rows;
}

// Resolve uma lista de usernames em ids (só aprovados/ativos).
async function resolverMencoes(usernames) {
  if (!usernames || !usernames.length) return [];
  const res = await db.query(
    `SELECT id_usuario, usuario FROM usuarios
      WHERE status = 'APROVADO' AND ativo = TRUE AND lower(usuario) = ANY($1)`,
    [usernames.map((u) => u.toLowerCase())]
  );
  return res.rows;
}

// Troca a senha mantendo-a definitiva (usado no fluxo de troca pelo próprio usuário).
async function atualizarSenha(idUsuario, senhaHash) {
  await db.query(
    `UPDATE usuarios SET senha_hash = $2, senha_provisoria = FALSE WHERE id_usuario = $1`,
    [idUsuario, senhaHash]
  );
}

// Reset pelo admin: define senha provisória (força troca no próximo acesso).
async function resetarSenha(idUsuario, senhaHash) {
  await db.query(
    `UPDATE usuarios SET senha_hash = $2, senha_provisoria = TRUE WHERE id_usuario = $1`,
    [idUsuario, senhaHash]
  );
}

async function atualizarStatus(idUsuario, status) {
  await db.query(`UPDATE usuarios SET status = $2 WHERE id_usuario = $1`, [idUsuario, status]);
}

async function listarPorStatus(status) {
  const res = await db.query(
    `SELECT ${COLUNAS} FROM usuarios WHERE status = $1 ORDER BY criado_em ASC`,
    [status]
  );
  return res.rows;
}

async function contarPorStatus(status) {
  const res = await db.query(`SELECT COUNT(*)::int AS n FROM usuarios WHERE status = $1`, [status]);
  return res.rows[0].n;
}

async function contarTotal() {
  const res = await db.query(`SELECT COUNT(*)::int AS n FROM usuarios`);
  return res.rows[0].n;
}

// Quantos participantes aprovados/ativos existem (entram automaticamente no sorteio).
async function contarParticipantesAptos() {
  const res = await db.query(
    `SELECT COUNT(*)::int AS n FROM usuarios
      WHERE status = 'APROVADO' AND ativo = TRUE AND tipo_usuario = 'PARTICIPANTE'`
  );
  return res.rows[0].n;
}

// Quantos administradores ativos e aprovados existem (guarda anti-lockout).
async function contarAdminsAtivos() {
  const res = await db.query(
    `SELECT COUNT(*)::int AS n FROM usuarios
      WHERE tipo_usuario = 'ADMINISTRADOR' AND ativo = TRUE AND status = 'APROVADO'`
  );
  return res.rows[0].n;
}

// O usuário participa de alguma campanha EM ANDAMENTO? (excluir quebraria o sorteio dela)
async function participaDeCampanhaAtiva(idUsuario) {
  return !!(await campanhaAtivaDoUsuario(idUsuario));
}

// A campanha EM ANDAMENTO da qual o usuário participa (ou null).
async function campanhaAtivaDoUsuario(idUsuario) {
  const res = await db.query(
    `SELECT c.id_campanha, c.nome FROM participantes p
       JOIN campanhas c ON c.id_campanha = p.id_campanha
      WHERE p.id_usuario = $1 AND c.status = 'EM_ANDAMENTO' LIMIT 1`,
    [idUsuario]
  );
  return res.rows[0] || null;
}

// Participantes da campanha em andamento que estão INATIVOS (saíram, foram inativados):
// o anjo deles segue sem ninguém para presentear até o sorteio ser refeito.
async function inativosNaCampanhaAtiva() {
  const res = await db.query(
    `SELECT u.id_usuario, u.nome, u.usuario, u.foto_perfil, c.id_campanha, c.nome AS campanha_nome
       FROM participantes p
       JOIN campanhas c ON c.id_campanha = p.id_campanha AND c.status = 'EM_ANDAMENTO'
       JOIN usuarios u ON u.id_usuario = p.id_usuario
      WHERE u.ativo = FALSE OR u.status <> 'APROVADO'
      ORDER BY lower(u.nome) ASC`
  );
  return res.rows;
}

// Todos os arquivos enviados pelo usuário (foto de perfil, galeria, posts, stories,
// comentários, mídias de chat) — para tirar do disco quando ele for excluído.
async function listarArquivosDoUsuario(idUsuario) {
  const res = await db.query(
    `SELECT foto_perfil AS c FROM usuarios WHERE id_usuario = $1
     UNION ALL SELECT caminho FROM preferencias_fotos WHERE id_usuario = $1
     UNION ALL SELECT imagem FROM posts WHERE id_usuario = $1
     UNION ALL SELECT video FROM posts WHERE id_usuario = $1
     UNION ALL SELECT imagem FROM post_comentarios WHERE id_usuario = $1
     UNION ALL SELECT imagem FROM stories WHERE id_usuario = $1
     UNION ALL SELECT video FROM stories WHERE id_usuario = $1
     UNION ALL SELECT imagem FROM mensagens_diretas WHERE id_remetente = $1
     UNION ALL SELECT audio FROM mensagens_diretas WHERE id_remetente = $1
     UNION ALL SELECT video FROM mensagens_diretas WHERE id_remetente = $1
     UNION ALL SELECT imagem FROM mensagens_anonimas WHERE id_usuario_origem = $1
     UNION ALL SELECT audio FROM mensagens_anonimas WHERE id_usuario_origem = $1
     UNION ALL SELECT video FROM mensagens_anonimas WHERE id_usuario_origem = $1`,
    [idUsuario]
  );
  return res.rows.map((r) => r.c).filter(Boolean);
}

// Exclui o usuário DEFINITIVAMENTE, numa transação.
// A maioria dos vínculos tem ON DELETE CASCADE (posts, DMs, curtidas, comentários,
// preferências, fotos, notificações; logs viram NULL). Só participantes e
// mensagens_anonimas não cascateiam — limpamos à mão antes.
async function excluir(idUsuario) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM mensagens_anonimas WHERE id_usuario_origem = $1 OR id_usuario_destino = $1`,
      [idUsuario]
    );
    // Apagar as participações cascateia para os pares de sorteio dessas campanhas.
    await client.query(`DELETE FROM participantes WHERE id_usuario = $1`, [idUsuario]);
    await client.query(`DELETE FROM usuarios WHERE id_usuario = $1`, [idUsuario]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  buscarPorUsuario,
  buscarPorId,
  listarTodos,
  contarResumo,
  criarCadastroPendente,
  criar,
  atualizar,
  definirAtivo,
  derrubarSessoes,
  atualizarFoto,
  marcarPerfilCompleto,
  atualizarBio,
  atualizarNome,
  atualizarNascimento,
  aniversariantesHoje,
  listarAprovados,
  buscarParaMencao,
  buscarUsuarios,
  resolverMencoes,
  buscarHumorHoje,
  atualizarHumor,
  atualizarSenha,
  resetarSenha,
  atualizarStatus,
  listarPorStatus,
  contarPorStatus,
  contarTotal,
  contarParticipantesAptos,
  contarAdminsAtivos,
  participaDeCampanhaAtiva,
  campanhaAtivaDoUsuario,
  inativosNaCampanhaAtiva,
  listarArquivosDoUsuario,
  excluir,
};
