'use strict';

/**
 * O sorteio do Anjo Secreto.
 *
 * Algoritmo: embaralha os participantes e os arruma num CICLO COMPLETO
 *   p0 → p1 → p2 → ... → p(n-1) → p0
 * onde "a → b" significa "a é anjo de b". Isso garante, por construção:
 *   - ninguém é anjo de si mesmo;
 *   - cada um é anjo de exatamente uma pessoa e tem exatamente um anjo;
 *   - é um único ciclo (não há subgrupos fechados).
 *
 * A gravação roda em TRANSAÇÃO com trava na campanha (SELECT ... FOR UPDATE),
 * impedindo que dois cliques simultâneos sorteiem a mesma campanha.
 */
const crypto = require('crypto');
const db = require('../config/db');
const sorteioModel = require('../models/sorteio.model');

const MIN_PARTICIPANTES = 3;

// Embaralhamento Fisher-Yates com aleatoriedade criptográfica.
function embaralhar(lista) {
  const a = lista.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Função PURA (testável): recebe ids de participantes, devolve os pares em ciclo.
function sortearCiclo(ids) {
  if (!Array.isArray(ids) || ids.length < MIN_PARTICIPANTES) {
    throw new Error(`Mínimo de ${MIN_PARTICIPANTES} participantes para sortear.`);
  }
  const ordem = embaralhar(ids);
  const pares = [];
  for (let i = 0; i < ordem.length; i++) {
    pares.push({ anjo: ordem[i], protegido: ordem[(i + 1) % ordem.length] });
  }
  return pares;
}

// Insere os pares e atualiza o status — dentro de uma transação já aberta (client).
async function gravarPares(client, idCampanha, idsParticipantes) {
  const pares = sortearCiclo(idsParticipantes);
  for (const p of pares) {
    await client.query(
      `INSERT INTO sorteios (id_campanha, id_anjo, id_protegido) VALUES ($1, $2, $3)`,
      [idCampanha, p.anjo, p.protegido]
    );
  }
  return pares.length;
}

async function participantesAtivos(client, idCampanha) {
  const res = await client.query(
    `SELECT id_participante FROM participantes WHERE id_campanha = $1 AND ativo = TRUE`,
    [idCampanha]
  );
  return res.rows.map((r) => r.id_participante);
}

// Adiciona TODOS os usuários aprovados/ativos (PARTICIPANTE, nunca admin) à campanha.
// Assim todo mundo cadastrado entra automaticamente no sorteio.
async function sincronizarParticipantes(client, idCampanha) {
  await client.query(
    `INSERT INTO participantes (id_campanha, id_usuario)
       SELECT $1, id_usuario FROM usuarios
        WHERE status = 'APROVADO' AND ativo = TRUE AND tipo_usuario = 'PARTICIPANTE'
     ON CONFLICT (id_campanha, id_usuario) DO NOTHING`,
    [idCampanha]
  );
}

/**
 * Inicia o sorteio (RASCUNHO → EM_ANDAMENTO). Uma vez por campanha.
 */
async function iniciarSorteio(idCampanha) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const c = await client.query(
      `SELECT id_campanha, status FROM campanhas WHERE id_campanha = $1 FOR UPDATE`,
      [idCampanha]
    );
    if (!c.rows[0]) { await client.query('ROLLBACK'); return { ok: false, motivo: 'NAO_ENCONTRADA' }; }
    if (c.rows[0].status !== 'RASCUNHO') { await client.query('ROLLBACK'); return { ok: false, motivo: 'JA_SORTEADA' }; }

    // Só pode haver uma campanha EM_ANDAMENTO por vez.
    const ativa = await client.query(`SELECT 1 FROM campanhas WHERE status = 'EM_ANDAMENTO' LIMIT 1`);
    if (ativa.rowCount > 0) { await client.query('ROLLBACK'); return { ok: false, motivo: 'OUTRA_ATIVA' }; }

    // Todos os aprovados entram automaticamente.
    await sincronizarParticipantes(client, idCampanha);
    const ids = await participantesAtivos(client, idCampanha);
    if (ids.length < MIN_PARTICIPANTES) { await client.query('ROLLBACK'); return { ok: false, motivo: 'POUCOS' }; }

    const total = await gravarPares(client, idCampanha, ids);
    await client.query(`UPDATE campanhas SET status = 'EM_ANDAMENTO' WHERE id_campanha = $1`, [idCampanha]);

    await client.query('COMMIT');
    return { ok: true, total };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Refaz o sorteio (ação administrativa específica). Arquiva as mensagens
 * da campanha (vínculos antigos deixam de valer) e gera novos pares.
 */
async function refazerSorteio(idCampanha) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const c = await client.query(
      `SELECT id_campanha, status FROM campanhas WHERE id_campanha = $1 FOR UPDATE`,
      [idCampanha]
    );
    if (!c.rows[0]) { await client.query('ROLLBACK'); return { ok: false, motivo: 'NAO_ENCONTRADA' }; }
    if (c.rows[0].status !== 'EM_ANDAMENTO') { await client.query('ROLLBACK'); return { ok: false, motivo: 'NAO_SORTEADA' }; }

    // Inclui quem entrou depois (novos aprovados).
    await sincronizarParticipantes(client, idCampanha);
    const ids = await participantesAtivos(client, idCampanha);
    if (ids.length < MIN_PARTICIPANTES) { await client.query('ROLLBACK'); return { ok: false, motivo: 'POUCOS' }; }

    // Mensagens antigas referenciavam os pares antigos → arquiva.
    await client.query(`UPDATE mensagens_anonimas SET arquivada = TRUE WHERE id_campanha = $1`, [idCampanha]);
    await client.query(`DELETE FROM sorteios WHERE id_campanha = $1`, [idCampanha]);

    const total = await gravarPares(client, idCampanha, ids);

    await client.query('COMMIT');
    return { ok: true, total };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function verificarSorteioRealizado(idCampanha) {
  return sorteioModel.existeSorteio(idCampanha);
}
function buscarProtegidoDoAnjo(idCampanha, idUsuario) {
  return sorteioModel.buscarProtegidoDoAnjo(idCampanha, idUsuario);
}
function buscarAnjoDoProtegido(idCampanha, idUsuario) {
  return sorteioModel.buscarAnjoDoProtegido(idCampanha, idUsuario);
}
function listarPares(idCampanha) {
  return sorteioModel.listarPares(idCampanha);
}

module.exports = {
  MIN_PARTICIPANTES,
  sortearCiclo, // exportado para testes
  iniciarSorteio,
  refazerSorteio,
  verificarSorteioRealizado,
  buscarProtegidoDoAnjo,
  buscarAnjoDoProtegido,
  listarPares,
};
