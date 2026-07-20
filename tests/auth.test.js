'use strict';

// Testes de autenticação/autorização e segurança (supertest + app real).
// Requer o PostgreSQL configurado (mesmas variáveis do app).
const { test, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/config/db');

after(async () => { await pool.end(); });

test('GET /login responde 200 e pede usuário', async () => {
  const res = await request(app).get('/login');
  assert.strictEqual(res.status, 200);
  assert.match(res.text, /Usu[áa]rio/);
});

test('GET / redireciona para /login', async () => {
  const res = await request(app).get('/');
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/login');
});

test('GET /admin sem login redireciona para /login', async () => {
  const res = await request(app).get('/admin');
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/login');
});

test('GET /participante sem login redireciona para /login', async () => {
  const res = await request(app).get('/participante');
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/login');
});

test('GET /admin/usuarios sem login redireciona para /login', async () => {
  const res = await request(app).get('/admin/usuarios');
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/login');
});

test('POST sem token CSRF é bloqueado (403)', async () => {
  const res = await request(app).post('/login').type('form').send({ usuario: 'x', senha: 'y' });
  assert.strictEqual(res.status, 403);
});

test('GET /health responde com status do banco', async () => {
  const res = await request(app).get('/health');
  assert.ok(res.status === 200 || res.status === 503);
  assert.ok(['ok', 'indisponivel', 'desconhecido'].includes(res.body.banco));
});

test('cabeçalhos de segurança presentes (Helmet/CSP)', async () => {
  const res = await request(app).get('/login');
  assert.ok(res.headers['content-security-policy'], 'deve ter CSP');
  assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
});
