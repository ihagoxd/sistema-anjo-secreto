'use strict';

// Testes do algoritmo de sorteio (função pura sortearCiclo).
// Rodar com: npm test   (node --test)
const { test } = require('node:test');
const assert = require('node:assert');
const { sortearCiclo, MIN_PARTICIPANTES } = require('../src/services/sorteio.service');

// Verifica as invariantes de um resultado de sorteio.
function checarInvariantes(ids) {
  const pares = sortearCiclo(ids);

  // 1) Um par por participante.
  assert.strictEqual(pares.length, ids.length, 'deve haver um par por participante');

  // 2) Ninguém é anjo de si mesmo.
  for (const p of pares) assert.notStrictEqual(p.anjo, p.protegido, 'ninguém é anjo de si mesmo');

  // 3) Cada participante é anjo exatamente uma vez e protegido exatamente uma vez.
  const anjos = new Set(pares.map((p) => p.anjo));
  const protegidos = new Set(pares.map((p) => p.protegido));
  assert.strictEqual(anjos.size, ids.length, 'cada um é anjo de uma única pessoa');
  assert.strictEqual(protegidos.size, ids.length, 'cada um tem um único anjo');
  for (const id of ids) {
    assert.ok(anjos.has(id), `${id} deve ser anjo de alguém`);
    assert.ok(protegidos.has(id), `${id} deve ter um anjo`);
  }

  // 4) É um ÚNICO ciclo completo: partindo de um anjo e seguindo anjo→protegido,
  //    visitamos todos os participantes antes de voltar ao início.
  const mapa = new Map(pares.map((p) => [p.anjo, p.protegido]));
  let atual = pares[0].anjo;
  const visitados = new Set();
  for (let i = 0; i < ids.length; i++) {
    assert.ok(!visitados.has(atual), 'não deve repetir antes de fechar o ciclo (sem subgrupos)');
    visitados.add(atual);
    atual = mapa.get(atual);
  }
  assert.strictEqual(atual, pares[0].anjo, 'o ciclo deve fechar no ponto de partida');
  assert.strictEqual(visitados.size, ids.length, 'o ciclo deve cobrir todos');
}

test('sorteia 3 participantes (mínimo)', () => {
  checarInvariantes([1, 2, 3]);
});

test('sorteia número par de participantes', () => {
  checarInvariantes([10, 20, 30, 40, 50, 60]);
});

test('sorteia número ímpar de participantes', () => {
  checarInvariantes([1, 2, 3, 4, 5, 6, 7]);
});

test('invariantes valem em muitas execuções (aleatoriedade)', () => {
  const ids = Array.from({ length: 12 }, (_, i) => i + 1);
  for (let r = 0; r < 200; r++) checarInvariantes(ids);
});

test('rejeita menos de 3 participantes', () => {
  assert.throws(() => sortearCiclo([1, 2]), /Mínimo de 3/);
  assert.throws(() => sortearCiclo([1]), /Mínimo de 3/);
  assert.throws(() => sortearCiclo([]), /Mínimo de 3/);
});

test('MIN_PARTICIPANTES é 3', () => {
  assert.strictEqual(MIN_PARTICIPANTES, 3);
});
