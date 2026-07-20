'use strict';

// Testes da classificação das mensagens nas duas threads (função pura).
const { test } = require('node:test');
const assert = require('node:assert');
const { classificarMensagens } = require('../src/services/mensagem.service');

// Cenário: EU = 1; meu protegido = 2 (sou anjo dele); meu anjo = 3.
const EU = 1;
const rows = [
  // eu mando para o meu protegido (2)
  { id_usuario_origem: 1, id_usuario_destino: 2, tipo_mensagem: 'ANJO_PARA_PROTEGIDO', mensagem: 'oi protegido', criado_em: 't1' },
  // meu protegido (2) me responde
  { id_usuario_origem: 2, id_usuario_destino: 1, tipo_mensagem: 'PROTEGIDO_PARA_ANJO', mensagem: 'oi anjo (do protegido)', criado_em: 't2' },
  // eu mando para o meu anjo (3)
  { id_usuario_origem: 1, id_usuario_destino: 3, tipo_mensagem: 'PROTEGIDO_PARA_ANJO', mensagem: 'oi meu anjo', criado_em: 't3' },
  // meu anjo (3) me manda
  { id_usuario_origem: 3, id_usuario_destino: 1, tipo_mensagem: 'ANJO_PARA_PROTEGIDO', mensagem: 'mensagem do anjo', criado_em: 't4' },
];

test('separa corretamente as threads do protegido e do anjo', () => {
  const { comProtegido, comAnjo } = classificarMensagens(rows, EU);

  // Thread do protegido: minha mensagem + resposta do protegido.
  assert.strictEqual(comProtegido.length, 2);
  assert.deepStrictEqual(comProtegido.map((m) => m.texto), ['oi protegido', 'oi anjo (do protegido)']);
  assert.deepStrictEqual(comProtegido.map((m) => m.minha), [true, false]);

  // Thread do anjo: minha mensagem + mensagem do anjo.
  assert.strictEqual(comAnjo.length, 2);
  assert.deepStrictEqual(comAnjo.map((m) => m.texto), ['oi meu anjo', 'mensagem do anjo']);
  assert.deepStrictEqual(comAnjo.map((m) => m.minha), [true, false]);
});

test('a mensagem recebida do anjo cai na thread do anjo (anonimato)', () => {
  const { comAnjo } = classificarMensagens(rows, EU);
  const recebidaDoAnjo = comAnjo.find((m) => !m.minha);
  assert.ok(recebidaDoAnjo, 'deve haver uma mensagem recebida do anjo');
  assert.strictEqual(recebidaDoAnjo.texto, 'mensagem do anjo');
});

test('lista vazia gera threads vazias', () => {
  const r = classificarMensagens([], EU);
  assert.deepStrictEqual(r, { comProtegido: [], comAnjo: [] });
});
