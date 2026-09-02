/* Service worker do Anjo Secreto — SÓ notificações push.
   Não intercepta rede nem faz cache (o HTML precisa estar sempre fresco). */
'use strict';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

function lerPayload(evento) {
  try { return evento.data ? evento.data.json() : {}; } catch (x) { return { titulo: 'Anjo Secreto', corpo: evento.data ? evento.data.text() : '' }; }
}

self.addEventListener('push', function (e) {
  var d = lerPayload(e);
  e.waitUntil((async function () {
    // Se o app está aberto e em foco, a própria página já mostra o aviso na tela —
    // evita duplicar (cartão + notificação do sistema ao mesmo tempo).
    var janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    var emFoco = janelas.some(function (c) { return c.focused && c.visibilityState === 'visible'; });
    if (emFoco) return;

    var opcoes = {
      body: d.corpo || '',
      icon: d.icone || '/img/icon-512.png',
      badge: '/img/icon-512.png',
      tag: d.tag || ('anjo-' + (d.id || Date.now())),
      renotify: true,
      vibrate: [60, 40, 90],
      timestamp: Date.now(),
      data: { url: d.url || '/notificacoes' },
      actions: [{ action: 'abrir', title: 'Abrir' }],
    };
    if (d.imagem) opcoes.image = d.imagem;
    var titulo = (d.emoji ? d.emoji + ' ' : '') + (d.titulo || 'Anjo Secreto');
    await self.registration.showNotification(titulo, opcoes);
  })());
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/notificacoes';
  e.waitUntil((async function () {
    var janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (var i = 0; i < janelas.length; i++) {
      var c = janelas[i];
      if ('focus' in c) {
        await c.focus();
        if ('navigate' in c) { try { await c.navigate(url); } catch (x) {} }
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});

// O navegador pode trocar a inscrição sozinho: reinscreve aqui; a página
// sincroniza a nova inscrição com o servidor (com CSRF) na próxima abertura.
self.addEventListener('pushsubscriptionchange', function (e) {
  e.waitUntil((async function () {
    try {
      var antiga = e.oldSubscription;
      await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: antiga ? antiga.options.applicationServerKey : undefined,
      });
    } catch (x) { /* o app reinscreve na próxima abertura */ }
  })());
});
