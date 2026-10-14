/* Service worker do Anjo Secreto (servido em /sw.js com a versão do deploy injetada).
   - Notificações push (como antes).
   - Cache dos arquivos estáticos (css/js/fontes/imagens do app): abrem na hora e offline.
   - Fotos/vídeos enviados (/uploads) ficam em cache limitado (nunca mudam de conteúdo).
   - Páginas HTML: sempre da rede (precisam estar frescas); sem conexão, mostra /offline.html.
   - JSON/API: só rede. */
'use strict';

var VERSAO = '__VER__';
var CACHE_APP = 'anjo-app-' + VERSAO;
var CACHE_MIDIA = 'anjo-midia-v1';
var MIDIA_MAX = 120;
var OFFLINE = '/offline.html';

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE_APP).then(function (c) { return c.addAll([OFFLINE]); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (chaves) {
    return Promise.all(chaves.filter(function (k) { return k.indexOf('anjo-app-') === 0 && k !== CACHE_APP; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function ehEstatico(url) { return /^\/(css|js|fonts|img)\//.test(url.pathname) || url.pathname === '/favicon.svg' || url.pathname === '/site.webmanifest'; }
function ehUpload(url) { return url.pathname.indexOf('/uploads/') === 0; }

// Mantém o cache de mídia pequeno: tira as entradas mais antigas quando passa do limite.
function podarMidia() {
  return caches.open(CACHE_MIDIA).then(function (c) {
    return c.keys().then(function (reqs) {
      if (reqs.length <= MIDIA_MAX) return;
      return Promise.all(reqs.slice(0, reqs.length - MIDIA_MAX).map(function (r) { return c.delete(r); }));
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegação (HTML): rede primeiro; sem rede, a página offline
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(function () { return caches.match(OFFLINE); }));
    return;
  }
  // Estáticos versionados (?v=): cache primeiro
  if (ehEstatico(url)) {
    e.respondWith(caches.open(CACHE_APP).then(function (c) {
      return c.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) { if (res && res.ok) c.put(req, res.clone()); return res; });
      });
    }));
    return;
  }
  // Fotos/vídeos enviados: cache primeiro, com limite
  if (ehUpload(url)) {
    e.respondWith(caches.open(CACHE_MIDIA).then(function (c) {
      return c.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && res.ok && res.headers.get('content-length') !== null && Number(res.headers.get('content-length')) < 8 * 1024 * 1024) {
            c.put(req, res.clone()).then(podarMidia);
          }
          return res;
        });
      });
    }));
  }
  // O resto (JSON, SSE, etc.): rede normal
});

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
