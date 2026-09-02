'use strict';

/**
 * Web Push: notificação no celular/desktop mesmo com o app fechado.
 *
 * - As chaves VAPID são geradas uma única vez e guardadas em app_config
 *   (zero configuração; podem ser fixadas por VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).
 * - Os navegadores só permitem push sob HTTPS (ou localhost). Em HTTP puro o
 *   cliente nem tenta se inscrever — e nada aqui quebra.
 * - Nunca lança: falha de push não pode derrubar quem gerou a notificação.
 */
const notificacaoModel = require('../models/notificacao.model');

let webpush = null;
try { webpush = require('web-push'); } catch (e) { console.warn('[push] web-push não instalado — push desativado'); }

let chaves = null; // { publicKey, privateKey }
let carregando = null;

async function carregarChaves() {
  if (chaves) return chaves;
  if (!webpush) return null;
  if (carregando) return carregando;
  carregando = (async () => {
    let publicKey = process.env.VAPID_PUBLIC_KEY || null;
    let privateKey = process.env.VAPID_PRIVATE_KEY || null;
    if (!publicKey || !privateKey) {
      publicKey = await notificacaoModel.lerConfig('vapid_public');
      privateKey = await notificacaoModel.lerConfig('vapid_private');
    }
    if (!publicKey || !privateKey) {
      const par = webpush.generateVAPIDKeys();
      publicKey = par.publicKey;
      privateKey = par.privateKey;
      await notificacaoModel.gravarConfig('vapid_public', publicKey);
      await notificacaoModel.gravarConfig('vapid_private', privateKey);
      console.log('[push] chaves VAPID geradas e guardadas em app_config');
    }
    const assunto = process.env.VAPID_SUBJECT || 'mailto:anjo-secreto@localhost';
    webpush.setVapidDetails(assunto, publicKey, privateKey);
    chaves = { publicKey, privateKey };
    return chaves;
  })();
  try { return await carregando; } finally { carregando = null; }
}

function disponivel() {
  return !!webpush;
}

async function chavePublica() {
  const c = await carregarChaves();
  return c ? c.publicKey : null;
}

async function inscrever(idUsuario, sub, agente) {
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return false;
  await notificacaoModel.inserirInscricao({
    idUsuario, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, agente: String(agente || '').slice(0, 300),
  });
  return true;
}

function cancelar(idUsuario, endpoint) {
  if (!endpoint) return Promise.resolve();
  return notificacaoModel.removerInscricao(endpoint, idUsuario);
}

/**
 * Envia o payload para todos os aparelhos do usuário. Inscrições mortas
 * (404/410) são removidas. Retorna quantos envios deram certo.
 */
async function enviar(idUsuario, payload) {
  try {
    const c = await carregarChaves();
    if (!c) return 0;
    const subs = await notificacaoModel.listarInscricoes(idUsuario);
    if (!subs.length) return 0;
    const corpo = JSON.stringify(payload);
    let ok = 0;
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          corpo,
          { TTL: 60 * 60 * 6, urgency: 'high' }
        );
        ok++;
      } catch (err) {
        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          await notificacaoModel.removerInscricao(s.endpoint).catch(() => {});
        } else {
          console.error('[push] falha ao enviar:', err && (err.body || err.message));
        }
      }
    }));
    return ok;
  } catch (err) {
    console.error('[push]', err.message);
    return 0;
  }
}

module.exports = { disponivel, chavePublica, inscrever, cancelar, enviar };
