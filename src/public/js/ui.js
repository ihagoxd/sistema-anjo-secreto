/* Interações de UI: tema, menu lateral, alertas, confirmação,
   tela de carregamento + entrada animada dos elementos. Vanilla JS. */
(function () {
  'use strict';

  /* ---------- Sem zoom da página no mobile (sensação de app) ----------
     O iOS ignora user-scalable=no no viewport; bloqueamos o gesto de pinça
     via eventos "gesture*" (Safari). O lightbox/cropper têm zoom próprio
     por pointer events + touch-action:none, então não são afetados. */
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (ev) {
    document.addEventListener(ev, function (e) { e.preventDefault(); }, { passive: false });
  });

  /* ---------- Comentários: abrir/fechar inline no feed + responder sem recarregar ---------- */
  (function () {
    function escaparHtml(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
    function comMencoesJs(t) { return escaparHtml(t).replace(/@([a-zA-Z0-9_.]{2,})/g, '<a href="/u/$1" class="mencao">@$1</a>'); }

    // Abrir/fechar comentários: no celular vira gaveta (trava o scroll do fundo,
    // teclado só abre quando a pessoa toca no campo); no desktop segue inline.
    var mqCel = window.matchMedia('(max-width: 899px)');
    function ehGaveta(bloco) { return mqCel.matches && !bloco.closest('.tw-post-det'); }
    function abrirComentarios(bloco, btn) {
      bloco.removeAttribute('hidden');
      if (btn) btn.setAttribute('aria-expanded', 'true');
      if (ehGaveta(bloco)) {
        document.body.classList.add('sem-scroll');
      } else {
        var inp = bloco.querySelector('.tw-reply input[name="texto"]');
        if (inp) window.setTimeout(function () { inp.focus(); }, 50);
      }
    }
    function fecharComentarios(bloco, btn) {
      bloco.setAttribute('hidden', '');
      if (btn) btn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('sem-scroll');
    }
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-comentarios]');
      if (!btn) return;
      var id = btn.getAttribute('data-comentarios');
      var bloco = document.querySelector('.tw-comentarios-bloco[data-bloco="' + id + '"]');
      if (!bloco) return;
      if (bloco.hasAttribute('hidden')) abrirComentarios(bloco, btn);
      else fecharComentarios(bloco, btn);
    });

    // Emojis rápidos da folha de comentários: adiciona no campo de resposta
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-emoji-rapido]');
      if (!b) return;
      var bloco = b.closest('.tw-comentarios-bloco');
      var inp = bloco && bloco.querySelector('.tw-reply input[name="texto"]');
      if (inp) {
        inp.value += (inp.value && !/\s$/.test(inp.value) ? ' ' : '') + b.textContent.trim();
        inp.focus();
      }
    });

    // Esc fecha a folha de comentários aberta (no feed; na página do post ela é fixa)
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      document.querySelectorAll('.tw-post:not(.tw-post-det) .tw-comentarios-bloco:not([hidden])')
        .forEach(function (b) { fecharComentarios(b); });
    });

    // Responder via AJAX: adiciona o comentário na hora, sem recarregar a página
    document.addEventListener('submit', function (e) {
      var form = e.target.closest('form.tw-reply[data-reply]');
      if (!form) return;
      e.preventDefault();
      var inp = form.querySelector('input[name="texto"]');
      if (!inp || !(inp.value || '').trim()) return;
      var btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      fetch(form.action, {
        method: 'POST',
        headers: { 'X-Requested-With': 'fetch', 'Accept': 'application/json' },
        body: new URLSearchParams(new FormData(form)),
      })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function (d) {
          if (!d || !d.ok) return Promise.reject();
          var bloco = form.closest('.tw-comentarios-bloco');
          var lista = bloco.querySelector('.tw-comentarios');
          var c = d.comentario;
          var el = document.createElement('div');
          el.className = 'tw-coment';
          el.setAttribute('data-coment', c.id_comentario);
          var av = c.foto_perfil ? '<img src="' + c.foto_perfil + '" alt="">' : escaparHtml((c.nome || '?').trim().charAt(0).toUpperCase());
          el.innerHTML =
            '<a href="/u/' + encodeURIComponent(c.usuario) + '" class="tw-coment-av">' + av + '</a>' +
            '<div class="tw-coment-main"><div class="tw-coment-top">' +
            '<a href="/u/' + encodeURIComponent(c.usuario) + '" class="tw-coment-nome">' + escaparHtml(c.nome) + '</a>' +
            '<span class="tw-coment-meta">· agora</span></div>' +
            '<div class="tw-coment-texto">' + comMencoesJs(c.texto) + '</div></div>';
          if (lista) lista.appendChild(el);
          inp.value = '';
          // incrementa o contador do ícone
          var span = document.querySelector('[data-comentarios="' + bloco.getAttribute('data-bloco') + '"] .post-coments');
          if (span) span.textContent = (parseInt(span.textContent, 10) || 0) + 1;
        })
        .catch(function () { toast('Não foi possível comentar.'); })
        .finally(function () { if (btn) btn.disabled = false; });
    });
  })();

  /* ---------- Toast (aviso curto flutuante) ---------- */
  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('toast-ui');
    if (!t) { t = document.createElement('div'); t.id = 'toast-ui'; t.className = 'toast-ui'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('mostra');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('mostra'); }, 2200);
  }

  /* ---------- Tema (sidebar + topo mobile) ---------- */
  function alternarTema() {
    var atual = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    var novo = atual === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', novo);
    try { localStorage.setItem('tema', novo); } catch (e) {}
  }
  ['btn-tema', 'btn-tema-mob'].forEach(function (id) {
    var b = document.getElementById(id);
    if (b) b.addEventListener('click', alternarTema);
  });

  /* ---------- Menu lateral (off-canvas no mobile) ---------- */
  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('overlay');
  var btnMenu = document.getElementById('btn-menu');
  function fecharMenu() {
    if (sidebar) sidebar.classList.remove('aberta');
    if (overlay) overlay.classList.remove('aberta');
  }
  if (btnMenu && sidebar) {
    btnMenu.addEventListener('click', function () {
      sidebar.classList.toggle('aberta');
      if (overlay) overlay.classList.toggle('aberta');
    });
  }
  if (overlay) overlay.addEventListener('click', fecharMenu);

  /* ---------- Fechar alertas / confirmar (CSP-safe) ---------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-fechar]');
    if (b) { var a = b.closest('.alerta'); if (a) a.remove(); }
  });
  document.addEventListener('submit', function (e) {
    var f = e.target.closest('[data-confirmar]');
    if (f && !window.confirm(f.getAttribute('data-confirmar'))) e.preventDefault();
  });

  /* ---------- Modais (genérico: abrir/fechar por id) ---------- */
  function abrirModal(m) { if (m) { m.removeAttribute('hidden'); m.setAttribute('aria-hidden', 'false'); } }
  function fecharModal(m) { if (m) { m.setAttribute('hidden', ''); m.setAttribute('aria-hidden', 'true'); } }
  document.addEventListener('click', function (e) {
    var abrir = e.target.closest('[data-abrir-modal]');
    if (abrir) { abrirModal(document.getElementById(abrir.getAttribute('data-abrir-modal'))); return; }
    var fechar = e.target.closest('[data-fechar-modal]');
    if (fechar) {
      var id = fechar.getAttribute('data-fechar-modal');
      fecharModal(id ? document.getElementById(id) : fechar.closest('.modal'));
      return;
    }
    if (e.target.classList && e.target.classList.contains('modal')) fecharModal(e.target);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var abertos = document.querySelectorAll('.modal:not([hidden])');
      abertos.forEach(fecharModal);
    }
  });

  /* ---------- Sigilo: olhinho revela/oculta nome+foto do protegido (anti-espião) ---------- */
  (function () {
    // Todos os sigilos (lista + cabeçalho da conversa) andam JUNTOS:
    // revela um → revela todos; oculta um → oculta todos.
    function alternar(origem) {
      var revelar = origem ? !origem.classList.contains('revelado') : true;
      document.querySelectorAll('[data-sigilo]').forEach(function (b) { b.classList.toggle('revelado', revelar); });
    }
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-sigilo-toggle]');
      if (!t) return;
      e.preventDefault(); e.stopPropagation(); // não abre a conversa ao clicar no olho
      alternar(t.closest('[data-sigilo]'));
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var t = e.target && e.target.closest ? e.target.closest('[data-sigilo-toggle]') : null;
      if (!t) return;
      e.preventDefault();
      alternar(t.closest('[data-sigilo]'));
    });
  })();

  /* ---------- Notificações: marca como lidas ao abrir o sino ---------- */
  (function () {
    var metaCsrf = document.querySelector('meta[name="csrf-token"]');
    var CSRF = metaCsrf ? metaCsrf.getAttribute('content') : '';
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-abrir-notif]');
      if (!b) return;
      if (!document.querySelector('.js-notif-badge')) return; // nada não lido
      fetch('/notificacoes/ler-todas', { method: 'POST', headers: { 'X-CSRF-Token': CSRF, 'X-Requested-With': 'fetch' } }).catch(function () {});
      document.querySelectorAll('.js-notif-badge').forEach(function (x) { x.remove(); });
    });

    /* --- Tempo (quase) real: polling + toast na tela + Notification do navegador --- */
    if (!document.querySelector('[data-abrir-notif]')) return; // só p/ usuário logado

    function inicial(nome) { return (String(nome || '').trim()[0] || '?').toUpperCase(); }

    function ensureBadge(count) {
      document.querySelectorAll('.js-notif-badge').forEach(function (el) { if (count > 0) el.textContent = count; else el.remove(); });
      if (count > 0 && !document.querySelector('.js-notif-badge')) {
        var side = document.querySelector('.side-sino');
        if (side) { var s = document.createElement('span'); s.className = 'nav-badge js-notif-badge'; s.textContent = count; side.appendChild(s); }
        var topo = document.querySelector('.btn-sino');
        if (topo) { var t = document.createElement('span'); t.className = 'sino-badge js-notif-badge'; t.textContent = count; topo.appendChild(t); }
      }
    }

    // Adiciona a notificação nova no topo do painel do sino (mantém a lista fresca).
    function prependPainel(n) {
      var lista = document.querySelector('#painelNotif .notif-lista');
      if (!lista) return;
      var vazio = lista.querySelector('.notif-vazio'); if (vazio) vazio.remove();
      var a = document.createElement('a');
      a.className = 'notif-item nova';
      a.href = '/notificacoes/' + n.id + '/abrir';
      var av = n.temAtor ? (n.ator_foto ? '<img src="' + n.ator_foto + '" alt="">' : inicial(n.ator_nome)) + '<span class="notif-emoji">' + n.emoji + '</span>' : n.emoji;
      a.innerHTML = '<span class="notif-av ' + (n.temAtor ? '' : 'so-emoji') + '">' + av + '</span>'
        + '<div class="notif-txt"><span class="notif-linha">' + n.texto + '</span><span class="notif-tempo">agora</span></div>'
        + '<span class="notif-dot"></span>';
      lista.insertBefore(a, lista.firstChild);
    }

    function browserNotif(n) {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      try { new Notification('Anjo Secreto', { body: n.emoji + ' ' + n.texto, icon: '/favicon.svg', tag: 'anjo-notif-' + n.id }); } catch (x) {}
    }

    // Pede permissão de notificação quando o usuário abre o sino (gesto do usuário).
    document.addEventListener('click', function (e) {
      if (!e.target.closest('[data-abrir-notif]')) return;
      if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (x) {} }
    });

    var ultimaNotif = 0;
    var prim = document.querySelector('#painelNotif .notif-item');
    if (prim) { var m = (prim.getAttribute('href') || '').match(/\/notificacoes\/(\d+)\//); if (m) ultimaNotif = parseInt(m[1], 10); }

    function checarNotifs() {
      if (document.hidden) return;
      fetch('/notificacoes/novas?ultima=' + ultimaNotif, { headers: { 'X-Requested-With': 'fetch' } })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          ensureBadge(d.count);
          if (ultimaNotif > 0 && d.novas && d.novas.length) {
            d.novas.slice().reverse().forEach(function (n) {
              toast(n.emoji + ' ' + n.texto);
              browserNotif(n);
              prependPainel(n);
            });
          }
          if (d.ultima) ultimaNotif = Math.max(ultimaNotif, d.ultima);
        })
        .catch(function () {});
    }
    window.setInterval(checarNotifs, 25000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) checarNotifs(); });
  })();

  /* ---------- Aniversário: modal 1x por dia + "Presentear" ---------- */
  (function () {
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-toggle-gostos]');
      if (!t) return;
      var g = t.closest('.aniv-pessoa').querySelector('.aniv-gostos');
      if (g) g.hidden = !g.hidden;
    });
    var av = document.getElementById('modalAniversario');
    if (!av) return;
    var chave = 'anivVisto_' + (av.getAttribute('data-dia') || '');
    var visto = false;
    try { visto = !!sessionStorage.getItem(chave); } catch (e) {}
    if (!visto) {
      window.setTimeout(function () {
        if (window.__roletaAtiva) return; // a roleta tem prioridade; o aniversário aparece na próxima
        abrirModal(av);
        try { sessionStorage.setItem(chave, '1'); } catch (e) {}
      }, 1400);
    }
  })();

  /* ---------- Roleta: modal que revela o protegido girando os nomes ---------- */
  (function () {
    var modal = document.getElementById('modalRoleta');
    if (!modal) return;
    var palco = modal.querySelector('[data-roleta-palco]');
    var resultado = modal.querySelector('[data-roleta-resultado]');
    var display = modal.querySelector('[data-roleta-display]');
    if (!palco || !resultado || !display) return;

    var chave = 'roletaVista_' + modal.getAttribute('data-camp');
    var jaViu = false;
    try { jaViu = !!localStorage.getItem(chave); } catch (e) {}
    if (jaViu) return; // já viu e interagiu antes — não mostra mais

    var alvo = (modal.getAttribute('data-alvo') || '').trim();
    if (!alvo) return;
    var nomes = ((modal.querySelector('[data-roleta-nomes]') || {}).textContent || '')
      .split('|').map(function (s) { return s.trim(); }).filter(Boolean);

    window.__roletaAtiva = true; // dá prioridade sobre o modal de aniversário

    // Só marca como "vista" quando a pessoa INTERAGE (fecha, X, clica fora, Esc, ou vai ver
    // o que o protegido gosta). Se fechar o navegador sem clicar, aparece de novo.
    function marcarVista() { try { localStorage.setItem(chave, '1'); } catch (e) {} }
    modal.addEventListener('click', function (e) {
      if (e.target.closest('[data-fechar-modal]') || e.target.closest('.aniv-acoes a') || e.target === modal) marcarVista();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) marcarVista(); });

    function revelar() { palco.hidden = true; resultado.hidden = false; resultado.classList.add('roleta-revela'); }

    function girar() {
      if (nomes.length < 2) {
        display.textContent = alvo; display.classList.add('roleta-batido');
        window.setTimeout(revelar, 850); return;
      }
      var tempo = 0, dur = 2600, intervalo = 55;
      function passo() {
        display.textContent = nomes[Math.floor(Math.random() * nomes.length)];
        tempo += intervalo;
        if (tempo < dur) {
          var p = tempo / dur;
          intervalo = 55 + p * p * 300; // vai desacelerando
          window.setTimeout(passo, intervalo);
        } else {
          display.textContent = alvo;
          display.classList.add('roleta-batido');
          window.setTimeout(revelar, 850);
        }
      }
      window.setTimeout(passo, 400);
    }

    window.setTimeout(function () { abrirModal(modal); girar(); }, 700);
  })();

  /* ---------- Cropper genérico: círculo (avatar) ou quadrado (galeria) ----------
     Um único palco de recorte compartilhado; quem abre passa um callback que
     recebe o blob recortado (ou null se cancelou). */
  var Cropper = (function () {
    var cropper = document.getElementById('cropper');
    var palco = document.getElementById('cropperPalco');
    var cimg = document.getElementById('cropperImg');
    var zoom = document.getElementById('cropperZoom');
    var mascara = document.querySelector('.cropper-circulo');
    var titulo = document.querySelector('.cropper-titulo');
    if (!cropper || !palco || !cimg || !zoom) return null;

    var D = 280, natW = 0, natH = 0, base = 1, s = 1, tx = 0, ty = 0;
    var arrastando = false, px = 0, py = 0, urlAtual = null, aoFechar = null;

    function aplicar() { cimg.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')'; }
    function limitar() {
      var w = natW * s, h = natH * s;
      tx = Math.min(0, Math.max(D - w, tx));
      ty = Math.min(0, Math.max(D - h, ty));
    }
    function definirZoom(z) {
      var novo = base * z, cx = D / 2, cy = D / 2;
      var sx = (cx - tx) / s, sy = (cy - ty) / s;
      s = novo; tx = cx - sx * s; ty = cy - sy * s;
      limitar(); aplicar();
    }
    function abrir(file, opcoes, onDone) {
      opcoes = opcoes || {};
      aoFechar = onDone || null;
      if (mascara) mascara.classList.toggle('quadrado', opcoes.formato === 'quadrado');
      if (titulo) titulo.textContent = opcoes.titulo || 'Ajuste sua foto';
      if (urlAtual) URL.revokeObjectURL(urlAtual);
      urlAtual = URL.createObjectURL(file);
      cimg.onload = function () {
        natW = cimg.naturalWidth; natH = cimg.naturalHeight;
        base = Math.max(D / natW, D / natH);
        zoom.value = 1; s = base;
        tx = (D - natW * s) / 2; ty = (D - natH * s) / 2;
        limitar(); aplicar();
        cropper.hidden = false;
      };
      cimg.src = urlAtual;
    }
    function terminar(blob) {
      cropper.hidden = true;
      var cb = aoFechar; aoFechar = null;
      if (cb) cb(blob);
    }

    palco.addEventListener('pointerdown', function (e) { arrastando = true; px = e.clientX; py = e.clientY; try { palco.setPointerCapture(e.pointerId); } catch (x) {} });
    palco.addEventListener('pointermove', function (e) { if (!arrastando) return; tx += e.clientX - px; ty += e.clientY - py; px = e.clientX; py = e.clientY; limitar(); aplicar(); });
    palco.addEventListener('pointerup', function () { arrastando = false; });
    palco.addEventListener('pointercancel', function () { arrastando = false; });
    palco.addEventListener('wheel', function (e) {
      e.preventDefault();
      var z = parseFloat(zoom.value) + (e.deltaY < 0 ? 0.12 : -0.12);
      z = Math.min(3, Math.max(1, z)); zoom.value = z.toFixed(2); definirZoom(z);
    }, { passive: false });
    zoom.addEventListener('input', function () { definirZoom(parseFloat(this.value)); });

    document.getElementById('cropperCancelar').addEventListener('click', function () { terminar(null); });
    document.getElementById('cropperConfirmar').addEventListener('click', function () {
      var out = 400;
      var canvas = document.createElement('canvas'); canvas.width = out; canvas.height = out;
      var ctx = canvas.getContext('2d');
      var sx = (0 - tx) / s, sy = (0 - ty) / s, sSize = D / s;
      ctx.drawImage(cimg, sx, sy, sSize, sSize, 0, 0, out, out);
      canvas.toBlob(function (blob) { terminar(blob); }, 'image/jpeg', 0.9);
    });

    return { abrir: abrir };
  })();

  /* ---------- Foto de perfil: recorte circular ---------- */
  (function () {
    var inpFoto = document.getElementById('foto_perfil');
    if (!inpFoto) return;

    function preview(blobOuFile) {
      var alvo = document.getElementById(inpFoto.getAttribute('data-preview'));
      if (!alvo) return;
      alvo.innerHTML = '';
      var img = document.createElement('img');
      img.src = URL.createObjectURL(blobOuFile);
      alvo.appendChild(img);
    }

    inpFoto.addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      if (!Cropper) { preview(f); return; } // sem cropper: preview direto
      Cropper.abrir(f, { formato: 'circulo', titulo: 'Ajuste sua foto' }, function (blob) {
        if (!blob) { inpFoto.value = ''; return; }
        try {
          var dt = new DataTransfer();
          dt.items.add(new File([blob], 'foto.jpg', { type: 'image/jpeg' }));
          inpFoto.files = dt.files;
        } catch (x) { /* navegador sem DataTransfer: envia a original */ }
        preview(blob);
      });
    });
  })();

  /* ---------- Mural: curtir (AJAX) + preview da foto do post ---------- */
  (function () {
    var meta = document.querySelector('meta[name="csrf-token"]');
    var CSRF = meta ? meta.getAttribute('content') : '';
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-curtir]');
      if (!b) return;
      var id = b.getAttribute('data-curtir');
      b.disabled = true;
      fetch('/feed/' + id + '/curtir', { method: 'POST', headers: { 'X-CSRF-Token': CSRF, 'X-Requested-With': 'fetch' } })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          b.classList.toggle('ativo', !!d.curtiu);
          b.setAttribute('aria-pressed', d.curtiu ? 'true' : 'false');
          // Atualiza a linha "N curtidas" (estilo Instagram) do post
          var art = b.closest('.tw-post');
          var linha = art && art.querySelector('.ig-curtidas');
          if (linha) {
            var n = Number(d.total) || 0;
            linha.hidden = !n;
            linha.innerHTML = '<strong>' + n + '</strong> curtida' + (n === 1 ? '' : 's');
          }
        })
        .catch(function () {})
        .then(function () { b.disabled = false; });
    });

    // Repostar (AJAX).
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-repost]');
      if (!b) return;
      var id = b.getAttribute('data-repost');
      b.disabled = true;
      fetch('/feed/' + id + '/repostar', { method: 'POST', headers: { 'X-CSRF-Token': CSRF, 'X-Requested-With': 'fetch' } })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          b.classList.toggle('ativo', !!d.repostou);
          b.setAttribute('aria-pressed', d.repostou ? 'true' : 'false');
          var c = b.querySelector('.post-reposts');
          if (c) c.textContent = d.total;
          if (d.repostou) toast('Repostado! 🔁');
        })
        .catch(function () {})
        .then(function () { b.disabled = false; });
    });

    /* ---- Imagem do post: 1 clique amplia (lightbox), 2 cliques curte (❤️) ---- */
    var CORACAO_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
    function coracaoPop(container) {
      if (!container) return;
      var c = document.createElement('span');
      c.className = 'dbl-coracao';
      c.innerHTML = CORACAO_SVG;
      container.appendChild(c);
      setTimeout(function () { c.remove(); }, 850);
    }
    function curtirDaImagem(article, container) {
      coracaoPop(container);
      var btn = article && article.querySelector('[data-curtir]');
      if (btn && !btn.classList.contains('ativo')) btn.click(); // reusa o like existente (só curte, não descurte)
    }

    // Lightbox com zoom/pan/pinça (abre na mesma guia)
    var lb = null, lbImg = null;
    var lz = 1, ltx = 0, lty = 0;                 // zoom + translação
    var ptrs = {}, arr = false, apx = 0, apy = 0, moveu = 0;
    var pinch0 = 0, pinchZ0 = 1, lbUlt = 0;

    function aplicarZoom() {
      lbImg.style.transform = 'translate(' + ltx + 'px,' + lty + 'px) scale(' + lz + ')';
      lbImg.classList.toggle('ampliado', lz > 1.02);
    }
    function resetZoom() { lz = 1; ltx = 0; lty = 0; if (lbImg) aplicarZoom(); }
    function setZoom(nz, cx, cy) {
      nz = Math.max(1, Math.min(4, nz));
      var r = lbImg.getBoundingClientRect();
      var ox = cx - (r.left + r.width / 2);
      var oy = cy - (r.top + r.height / 2);
      var f = nz / lz;
      ltx -= ox * (f - 1); lty -= oy * (f - 1); lz = nz;
      if (lz <= 1.01) { ltx = 0; lty = 0; }
      aplicarZoom();
    }
    function montarLB() {
      if (lb) return;
      lb = document.createElement('div');
      lb.className = 'lightbox';
      lb.hidden = true;
      lb.innerHTML = '<button type="button" class="lightbox-x" aria-label="Fechar">&times;</button>'
        + '<div class="lightbox-dica">Role / pince para dar zoom · arraste para mover · toque 2× para ampliar</div>'
        + '<div class="lightbox-palco"><img alt="" draggable="false"></div>';
      document.body.appendChild(lb);
      lbImg = lb.querySelector('img');

      lb.addEventListener('click', function (e) {
        if (moveu > 6) return; // foi arraste, não clique
        if (e.target === lb || e.target.closest('.lightbox-x') || e.target.classList.contains('lightbox-palco')) fecharLB();
      });

      // duplo clique/toque → alterna zoom no ponto tocado
      lbImg.addEventListener('click', function (e) {
        if (moveu > 6) return;
        var agora = Date.now();
        if (agora - lbUlt < 320) { lbUlt = 0; setZoom(lz > 1.02 ? 1 : 2.5, e.clientX, e.clientY); }
        else lbUlt = agora;
      });

      lbImg.addEventListener('wheel', function (e) {
        e.preventDefault();
        setZoom(lz + (e.deltaY < 0 ? 0.35 : -0.35), e.clientX, e.clientY);
      }, { passive: false });

      lbImg.addEventListener('pointerdown', function (e) {
        ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
        try { lbImg.setPointerCapture(e.pointerId); } catch (x) {}
        var ids = Object.keys(ptrs);
        if (ids.length === 1) { arr = true; apx = e.clientX; apy = e.clientY; moveu = 0; }
        else if (ids.length === 2) {
          arr = false;
          var a = ptrs[ids[0]], b = ptrs[ids[1]];
          pinch0 = Math.hypot(a.x - b.x, a.y - b.y); pinchZ0 = lz;
        }
      });
      lbImg.addEventListener('pointermove', function (e) {
        if (!ptrs[e.pointerId]) return;
        ptrs[e.pointerId].x = e.clientX; ptrs[e.pointerId].y = e.clientY;
        var ids = Object.keys(ptrs);
        if (ids.length === 2) {
          var a = ptrs[ids[0]], b = ptrs[ids[1]];
          var d = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch0) setZoom(pinchZ0 * (d / pinch0), (a.x + b.x) / 2, (a.y + b.y) / 2);
        } else if (arr && lz > 1.02) {
          ltx += e.clientX - apx; lty += e.clientY - apy;
          moveu += Math.abs(e.clientX - apx) + Math.abs(e.clientY - apy);
          apx = e.clientX; apy = e.clientY; aplicarZoom();
        }
      });
      function up(e) {
        delete ptrs[e.pointerId];
        if (Object.keys(ptrs).length < 2) pinch0 = 0;
        if (Object.keys(ptrs).length === 0) arr = false;
      }
      lbImg.addEventListener('pointerup', up);
      lbImg.addEventListener('pointercancel', up);

      document.addEventListener('keydown', function (e) {
        if (lb.hidden) return;
        if (e.key === 'Escape') fecharLB();
        else if (e.key === '+' || e.key === '=') setZoom(lz + 0.4, window.innerWidth / 2, window.innerHeight / 2);
        else if (e.key === '-' || e.key === '_') setZoom(lz - 0.4, window.innerWidth / 2, window.innerHeight / 2);
      });
    }
    function abrirLB(src) {
      montarLB();
      lbImg.src = src; resetZoom(); lb.hidden = false;
      document.body.classList.add('sem-scroll');
    }
    function fecharLB() { if (lb) { lb.hidden = true; document.body.classList.remove('sem-scroll'); resetZoom(); } }

    // Detecção manual de clique simples x duplo — funciona no desktop E no toque (mobile),
    // usando só o evento 'click' (não depende de 'dblclick', instável no touch).
    var ultTempo = 0, ultAlvo = null, tLB = null;
    document.addEventListener('click', function (e) {
      var midia = e.target.closest('.tw-post-midia');
      if (!midia) return;
      var agora = Date.now();
      if (ultAlvo === midia && (agora - ultTempo) < 320) {
        clearTimeout(tLB); tLB = null; ultTempo = 0; ultAlvo = null;
        var art = midia.closest('.tw-post');
        if (art) curtirDaImagem(art, midia);            // post → duplo clique curte
        else abrirLB(midia.getAttribute('data-img'));   // imagem de mensagem → duplo só amplia
        return;
      }
      ultTempo = agora; ultAlvo = midia;
      clearTimeout(tLB);
      tLB = setTimeout(function () {
        tLB = null; ultAlvo = null;
        abrirLB(midia.getAttribute('data-img'), midia.getAttribute('data-post-id')); // simples → amplia
      }, 300);
    });

    // Galeria "Fotos de ideias": clique amplia no lightbox (mesma guia, sem curtir).
    document.addEventListener('click', function (e) {
      var g = e.target.closest('.gg-img');
      if (!g) return;
      abrirLB(g.getAttribute('data-img'), null);
    });

    // Compartilhar: abre a folha "enviar no Direct" (se existir na página) ou copia o link.
    var shareUrl = '';
    function copiarLink(url) {
      function feito() { toast('Link copiado! 🔗'); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(feito).catch(function () { toast(url); });
      } else {
        var t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); feito(); } catch (x) { toast(url); }
        t.remove();
      }
    }
    document.addEventListener('click', function (e) {
      var s = e.target.closest('[data-share]');
      if (s) {
        shareUrl = location.origin + s.getAttribute('data-share');
        var sheet = document.getElementById('modal-share');
        if (sheet) { sheet.removeAttribute('hidden'); sheet.setAttribute('aria-hidden', 'false'); }
        else copiarLink(shareUrl);
        return;
      }
      // Enviar no Direct: manda o post na hora, sem sair do mural (como no Instagram).
      // No chat, o link vira um cartão de preview da publicação.
      var dm = e.target.closest('[data-share-dm]');
      if (dm && shareUrl) {
        dm.disabled = true;
        var corpo = new URLSearchParams();
        corpo.set('mensagem', shareUrl);
        fetch('/mensagens/u/' + dm.getAttribute('data-share-dm'), {
          method: 'POST',
          headers: { 'X-CSRF-Token': CSRF, 'X-Requested-With': 'fetch' },
          body: corpo
        })
          .then(function (r) { if (!r.ok) throw new Error('falhou'); return r.json(); })
          .then(function () {
            var rot = dm.querySelector('.share-envia');
            if (rot) rot.textContent = 'Enviado ✓';
            toast('Post enviado no Direct! ✈️');
          })
          .catch(function () { dm.disabled = false; toast('Não foi possível enviar.'); });
        return;
      }
      var cp = e.target.closest('[data-share-copiar]');
      if (cp) {
        copiarLink(shareUrl);
        var m = document.getElementById('modal-share');
        if (m) { m.setAttribute('hidden', ''); m.setAttribute('aria-hidden', 'true'); }
      }
    });
  })();

  /* ---------- Galeria "Fotos de ideias": recorte quadrado + remover antes de salvar ---------- */
  (function () {
    var inpGal = document.getElementById('fotos');
    if (!inpGal) return;
    var cont = document.getElementById(inpGal.getAttribute('data-galeria'));
    if (!cont) return;
    var add = cont.querySelector('.galeria-add');
    var podeEditar = !!Cropper && typeof DataTransfer !== 'undefined';
    var acumulado = podeEditar ? new DataTransfer() : null;

    function render() {
      Array.prototype.slice.call(cont.querySelectorAll('.thumb.novo')).forEach(function (t) { t.remove(); });
      Array.prototype.forEach.call(inpGal.files, function (f, i) {
        var d = document.createElement('div');
        d.className = 'thumb novo';
        var img = document.createElement('img');
        img.src = URL.createObjectURL(f);
        d.appendChild(img);
        if (podeEditar) {
          var x = document.createElement('button');
          x.type = 'button'; x.className = 'galeria-remover thumb-x';
          x.setAttribute('aria-label', 'Remover esta foto');
          x.setAttribute('data-i', i);
          x.textContent = '×';
          d.appendChild(x);
        }
        cont.insertBefore(d, add);
      });
    }

    // X na miniatura: tira só aquela foto da leva que vai ser enviada.
    cont.addEventListener('click', function (e) {
      var b = e.target.closest('.thumb-x');
      if (!b || !podeEditar) return;
      var i = +b.getAttribute('data-i');
      var dt = new DataTransfer();
      Array.prototype.forEach.call(acumulado.files, function (f, j) { if (j !== i) dt.items.add(f); });
      acumulado = dt;
      inpGal.files = acumulado.files;
      render();
    });

    inpGal.addEventListener('change', function () {
      if (!podeEditar) { render(); return; }
      // O navegador SUBSTITUI a seleção a cada escolha; guardamos as novas,
      // devolvemos as já recortadas e passamos cada nova pelo recorte quadrado.
      var novos = Array.prototype.slice.call(inpGal.files);
      inpGal.files = acumulado.files;
      (function proximo(i) {
        if (i >= novos.length) return;
        Cropper.abrir(novos[i], {
          formato: 'quadrado',
          titulo: novos.length > 1 ? 'Ajuste a foto ' + (i + 1) + ' de ' + novos.length : 'Ajuste a foto'
        }, function (blob) {
          if (blob) {
            acumulado.items.add(new File([blob], 'ideia-' + Date.now() + '-' + i + '.jpg', { type: 'image/jpeg' }));
            inpGal.files = acumulado.files;
            render();
          }
          proximo(i + 1);
        });
      })(0);
    });
  })();

  /* ---------- Direct: mensagem de voz (mic vira "enviar" ao digitar, como no WhatsApp) ---------- */
  (function () {
    var form = document.querySelector('.dm-composer');
    if (!form) return;
    var ta = form.querySelector('textarea[data-texto]');
    var btnEnviar = form.querySelector('[data-btn-enviar]');
    var btnMic = form.querySelector('[data-gravar]');
    var foto = form.querySelector('[data-foto]');
    var linhaNormal = form.querySelector('[data-linha-normal]');
    var linhaGrav = form.querySelector('[data-linha-gravando]');
    var tempoEl = form.querySelector('[data-grav-tempo]');
    var inputAudio = form.querySelector('[data-audio-input]');
    if (!ta || !btnEnviar || !btnMic || !linhaGrav || !inputAudio) return;

    // Mic quando vazio; botão de enviar quando tem texto ou foto anexada
    function alternar() {
      var temAlgo = !!ta.value.trim() || !!(foto && foto.files && foto.files.length);
      btnEnviar.hidden = !temAlgo;
      btnMic.hidden = temAlgo;
    }
    ta.addEventListener('input', alternar);
    if (foto) foto.addEventListener('change', alternar);
    alternar();

    // Forma de onda animada (estilo WhatsApp) — barrinhas criadas uma vez
    var onda = form.querySelector('.dm-onda');
    if (onda && !onda.childElementCount) {
      for (var i = 0; i < 26; i++) onda.appendChild(document.createElement('span'));
    }

    var rec = null, pedacos = [], stream = null, timer = null, t0 = 0, decorrido = 0, enviarAoParar = false;
    function fmt(s) { var m = Math.floor(s / 60), ss = Math.floor(s % 60); return m + ':' + (ss < 10 ? '0' : '') + ss; }
    function tempoTotal() { return decorrido + (rec && rec.state === 'recording' ? Date.now() - t0 : 0); }
    function pararTudo() {
      if (timer) clearInterval(timer);
      timer = null;
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
      linhaGrav.classList.remove('pausada');
    }
    function mostrarGravando(mostra) { linhaNormal.hidden = mostra; linhaGrav.hidden = !mostra; }

    btnMic.addEventListener('click', function () {
      // Sem getUserMedia (ex.: HTTP na rede interna): cai no gravador/arquivo do sistema
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
        inputAudio.click();
        return;
      }
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
        stream = s; pedacos = []; enviarAoParar = false; decorrido = 0;
        var opts = {};
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) opts.mimeType = 'audio/webm;codecs=opus';
        else if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/mp4')) opts.mimeType = 'audio/mp4';
        rec = new MediaRecorder(s, opts);
        var base = (rec.mimeType || 'audio/webm').split(';')[0];
        rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) pedacos.push(ev.data); };
        rec.onstop = function () {
          pararTudo();
          mostrarGravando(false);
          if (!enviarAoParar || !pedacos.length) { pedacos = []; return; }
          var blob = new Blob(pedacos, { type: base });
          try {
            var ext = base === 'audio/mp4' ? '.m4a' : base === 'audio/ogg' ? '.ogg' : '.webm';
            var dt = new DataTransfer();
            dt.items.add(new File([blob], 'voz' + ext, { type: base }));
            inputAudio.files = dt.files;
            form.submit();
          } catch (x) { toast('Não foi possível preparar o áudio.'); }
        };
        rec.start(250);
        t0 = Date.now();
        tempoEl.textContent = '0:00';
        mostrarGravando(true);
        timer = setInterval(function () {
          var seg = tempoTotal() / 1000;
          tempoEl.textContent = fmt(seg);
          if (seg >= 120 && rec.state !== 'inactive') { enviarAoParar = true; rec.stop(); } // máx. 2 min
        }, 250);
      }).catch(function () { toast('Não consegui acessar o microfone.'); });
    });
    form.querySelector('[data-grav-cancelar]').addEventListener('click', function () {
      if (rec && rec.state !== 'inactive') { enviarAoParar = false; rec.stop(); }
      else { pararTudo(); mostrarGravando(false); }
    });
    form.querySelector('[data-grav-enviar]').addEventListener('click', function () {
      if (rec && rec.state !== 'inactive') { enviarAoParar = true; rec.stop(); }
    });
    // Pausar/retomar (como no WhatsApp): a onda congela e o tempo para de contar
    var btnPausa = form.querySelector('[data-grav-pausa]');
    if (btnPausa) btnPausa.addEventListener('click', function () {
      if (!rec) return;
      if (rec.state === 'recording' && rec.pause) {
        rec.pause();
        decorrido += Date.now() - t0;
        linhaGrav.classList.add('pausada');
      } else if (rec.state === 'paused' && rec.resume) {
        rec.resume();
        t0 = Date.now();
        linhaGrav.classList.remove('pausada');
      }
    });
    // Fallback sem getUserMedia: o arquivo escolhido/gravado pelo sistema é enviado direto
    inputAudio.addEventListener('change', function () {
      if (inputAudio.files && inputAudio.files.length) form.submit();
    });
  })();

  /* ---------- Player das mensagens de voz ---------- */
  (function () {
    function fmt(s) { var m = Math.floor(s / 60), ss = Math.floor(s % 60); return m + ':' + (ss < 10 ? '0' : '') + ss; }
    document.querySelectorAll('.dm-audio').forEach(function (box) {
      var au = box.querySelector('audio');
      var prog = box.querySelector('.dm-audio-prog');
      var tempo = box.querySelector('[data-audio-tempo]');
      var trilha = box.querySelector('.dm-audio-trilha');
      function dur() { return isFinite(au.duration) && au.duration > 0 ? au.duration : 0; }
      au.addEventListener('loadedmetadata', function () { if (dur()) tempo.textContent = fmt(dur()); });
      au.addEventListener('timeupdate', function () {
        var d = dur();
        if (d) prog.style.width = (au.currentTime / d) * 100 + '%';
        tempo.textContent = fmt(au.currentTime);
      });
      au.addEventListener('play', function () {
        document.querySelectorAll('.dm-audio audio').forEach(function (o) { if (o !== au) o.pause(); });
        box.classList.add('tocando');
      });
      au.addEventListener('pause', function () { box.classList.remove('tocando'); });
      au.addEventListener('ended', function () {
        box.classList.remove('tocando');
        prog.style.width = '0%';
        au.currentTime = 0;
        if (dur()) tempo.textContent = fmt(dur());
      });
      trilha.addEventListener('click', function (ev) {
        var d = dur();
        if (!d) return;
        var r = trilha.getBoundingClientRect();
        au.currentTime = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * d;
      });
    });
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-audio-play]');
      if (!b) return;
      var au = b.closest('.dm-audio').querySelector('audio');
      if (au.paused) au.play();
      else au.pause();
    });
  })();

  /* ---------- Direct (mensagens): Enter envia, auto-scroll, editar ---------- */
  (function () {
    var msgs = document.getElementById('dmMsgs');

    // Rola para o fim da conversa.
    if (msgs) msgs.scrollTop = msgs.scrollHeight;

    // Enter envia (Shift+Enter = nova linha) + auto-crescer.
    var ta = document.querySelector('.dm-composer textarea[data-enter-envia]');
    if (ta) {
      function ajustar() { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 130) + 'px'; }
      ta.addEventListener('input', ajustar);
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          var form = ta.form;
          var fi = form && form.querySelector('[data-foto]');
          var temFoto = fi && fi.files && fi.files.length;
          if (form && (ta.value.trim() || temFoto)) {
            if (form.requestSubmit) form.requestSubmit(); else form.submit();
          }
        }
      });
      ta.focus();
      var v = ta.value; ta.value = ''; ta.value = v; // cursor ao fim
    }

    // Editar mensagem (inline, AJAX).
    if (msgs) {
      var CSRF = (document.querySelector('meta[name="csrf-token"]') || {}).content
        || (document.querySelector('meta[name="csrf-token"]') && document.querySelector('meta[name="csrf-token"]').getAttribute('content')) || '';
      var url = msgs.getAttribute('data-editar-url') || '/mensagens/editar';

      msgs.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-editar-msg]');
        if (!btn) return;
        var bolha = btn.closest('.dm-bolha');
        var elTxt = bolha.querySelector('.dm-bolha-txt');
        if (bolha.querySelector('.dm-edit-box')) return; // já editando
        var original = elTxt.textContent;

        var box = document.createElement('div');
        box.className = 'dm-edit-box';
        var input = document.createElement('textarea');
        input.className = 'dm-edit-input';
        input.value = original;
        var acoes = document.createElement('div');
        acoes.className = 'dm-edit-acoes';
        var salvar = document.createElement('button'); salvar.type = 'button'; salvar.className = 'btn btn-primario btn-sm'; salvar.textContent = 'Salvar';
        var cancelar = document.createElement('button'); cancelar.type = 'button'; cancelar.className = 'btn btn-secundario btn-sm'; cancelar.textContent = 'Cancelar';
        acoes.appendChild(cancelar); acoes.appendChild(salvar);
        box.appendChild(input); box.appendChild(acoes);
        elTxt.style.display = 'none';
        bolha.insertBefore(box, elTxt.nextSibling);
        input.focus(); input.setSelectionRange(original.length, original.length);
        input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px';

        function fechar() { box.remove(); elTxt.style.display = ''; }
        cancelar.addEventListener('click', fechar);
        input.addEventListener('keydown', function (ev) {
          if (ev.key === 'Escape') { ev.preventDefault(); fechar(); }
          if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); salvar.click(); }
        });
        salvar.addEventListener('click', function () {
          var novo = input.value.trim();
          if (!novo || novo === original) { fechar(); return; }
          salvar.disabled = true;
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF, 'X-Requested-With': 'fetch' },
            body: JSON.stringify({ escopo: btn.getAttribute('data-escopo'), id: btn.getAttribute('data-id'), texto: novo }),
          })
            .then(function (r) { return r.ok ? r.json() : r.json().then(function (d) { throw new Error(d.erro || 'Falha'); }); })
            .then(function (d) {
              elTxt.textContent = d.texto;
              var ed = bolha.querySelector('.dm-editada');
              if (ed) ed.hidden = false;
              fechar();
            })
            .catch(function (err) { salvar.disabled = false; alert(err.message || 'Não foi possível editar.'); });
        });
      });
    }
  })();

  /* ---------- @menções: autocomplete (estilo Twitter) ---------- */
  (function () {
    var campos = document.querySelectorAll('[data-mencoes]');
    if (!campos.length) return;

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function ini(nome) { return (String(nome || '').trim()[0] || '?').toUpperCase(); }

    var box = document.createElement('div');
    box.className = 'mencao-lista';
    box.hidden = true;
    document.body.appendChild(box);

    var ativo = null, itens = [], sel = -1, inicioTermo = 0, timer = null;

    function fechar() { box.hidden = true; ativo = null; itens = []; sel = -1; }
    function posicionar(el) {
      var r = el.getBoundingClientRect();
      box.style.left = (window.scrollX + r.left) + 'px';
      box.style.top = (window.scrollY + r.bottom + 4) + 'px';
      box.style.width = Math.max(230, Math.min(r.width, 340)) + 'px';
    }
    function render() {
      if (!itens.length) { box.hidden = true; return; }
      box.innerHTML = itens.map(function (u, i) {
        var av = u.foto_perfil ? '<img src="' + esc(u.foto_perfil) + '" alt="">' : ini(u.nome);
        return '<button type="button" class="mencao-item' + (i === sel ? ' sel' : '') + '" data-i="' + i + '">' +
          '<span class="mencao-av">' + av + '</span>' +
          '<span class="mencao-txt"><span class="mencao-nome">' + esc(u.nome) + '</span>' +
          '<span class="mencao-user">@' + esc(u.usuario) + '</span></span></button>';
      }).join('');
      box.hidden = false;
    }
    function tokenAntes(el) {
      var v = el.value.slice(0, el.selectionStart);
      var m = v.match(/(^|[\s(.,!?:;])@([a-zA-Z0-9_.]*)$/);
      if (!m) return null;
      return { termo: m[2], inicio: el.selectionStart - m[2].length - 1 };
    }
    function buscar(el) {
      var t = tokenAntes(el);
      if (!t) { fechar(); return; }
      ativo = el; inicioTermo = t.inicio; posicionar(el);
      clearTimeout(timer);
      timer = setTimeout(function () {
        fetch('/mencoes?q=' + encodeURIComponent(t.termo))
          .then(function (r) { return r.json(); })
          .then(function (d) { if (ativo !== el) return; itens = d || []; sel = itens.length ? 0 : -1; render(); })
          .catch(function () {});
      }, 130);
    }
    function inserir(el, u) {
      var fim = el.selectionStart;
      var v = el.value;
      el.value = v.slice(0, inicioTermo) + '@' + u.usuario + ' ' + v.slice(fim);
      var pos = inicioTermo + u.usuario.length + 2;
      el.setSelectionRange(pos, pos);
      fechar(); el.focus();
    }

    campos.forEach(function (el) {
      el.addEventListener('input', function () { buscar(el); });
      el.addEventListener('keydown', function (e) {
        if (box.hidden || ativo !== el || !itens.length) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % itens.length; render(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + itens.length) % itens.length; render(); }
        else if (e.key === 'Enter' || e.key === 'Tab') { if (sel >= 0 && itens[sel]) { e.preventDefault(); inserir(el, itens[sel]); } }
        else if (e.key === 'Escape') { fechar(); }
      });
      el.addEventListener('blur', function () { setTimeout(fechar, 150); });
    });
    box.addEventListener('mousedown', function (e) {
      var b = e.target.closest('.mencao-item');
      if (!b || !ativo) return;
      e.preventDefault();
      inserir(ativo, itens[parseInt(b.getAttribute('data-i'), 10)]);
    });
    window.addEventListener('scroll', function () { if (!box.hidden) fechar(); }, true);
  })();

  /* ---------- Compositor: emoji + foto + câmera + preview ---------- */
  (function () {
    // Preview do anexo (imagem escolhida/capturada)
    function mostrarPreview(form) {
      if (!form) return;
      var input = form.querySelector('[data-foto]');
      var prev = form.querySelector('[data-preview]');
      if (!input || !prev) return;
      var f = input.files && input.files[0];
      prev.innerHTML = '';
      if (!f) { prev.hidden = true; return; }
      var wrap = document.createElement('div'); wrap.className = 'anexo-item';
      var img = document.createElement('img'); img.src = URL.createObjectURL(f); wrap.appendChild(img);
      var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'anexo-remover'; rm.setAttribute('aria-label', 'Remover'); rm.innerHTML = '&times;';
      rm.addEventListener('click', function () { input.value = ''; prev.innerHTML = ''; prev.hidden = true; });
      wrap.appendChild(rm);
      prev.appendChild(wrap); prev.hidden = false;
    }
    document.addEventListener('change', function (e) {
      var input = e.target.closest('[data-foto]');
      if (input) mostrarPreview(input.form);
    });

    // Botão "Foto" → abre a galeria
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-foto-btn]');
      if (!b || !b.form) return;
      var input = b.form.querySelector('[data-foto]');
      if (input) { input.removeAttribute('capture'); input.click(); }
    });

    // ----- Seletor de emoji -----
    var EMOJIS = ('😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥳 '
      + '🤩 😏 😒 😞 😔 😟 😕 🙁 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😲 🥱 😴 🤤 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤠 '
      + '👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ✋ 🖐️ 🖖 👋 🤝 🙏 💪 👏 🙌 👐 ✊ '
      + '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 💕 💞 💓 💗 💖 💘 💝 💯 🔥 ⭐ ✨ 🎉 🎊 🎈 🎁 🎂 🍰 🧁 🍫 🍬 🍭 🍿 🍔 🍟 🍕 🌭 🥪 🌮 🥗 🍜 ☕ 🧋 🥤 🍺 🍻 🥂 '
      + '⚽ 🏀 🎮 🎯 🎸 🎤 🎧 📱 💻 🚗 ✈️ 🏆 🥇 👀 ✅ ❌ ⚡').split(' ').filter(Boolean);
    var painel = null, alvoTexto = null;
    function montarPainel() {
      if (painel) return;
      painel = document.createElement('div'); painel.className = 'emoji-painel'; painel.hidden = true;
      painel.innerHTML = '<div class="emoji-grade">' + EMOJIS.map(function (e) { return '<button type="button" class="emoji-b">' + e + '</button>'; }).join('') + '</div>';
      document.body.appendChild(painel);
      painel.addEventListener('mousedown', function (ev) { ev.preventDefault(); }); // mantém foco/seleção do campo
      painel.addEventListener('click', function (ev) { var b = ev.target.closest('.emoji-b'); if (b && alvoTexto) inserirNoCampo(alvoTexto, b.textContent); });
      document.addEventListener('click', function (ev) { if (painel.hidden) return; if (ev.target.closest('[data-emoji]')) return; if (!painel.contains(ev.target)) painel.hidden = true; });
    }
    function inserirNoCampo(campo, txt) {
      var s = campo.selectionStart, e = campo.selectionEnd, v = campo.value;
      if (s == null) { s = e = v.length; }
      campo.value = v.slice(0, s) + txt + v.slice(e);
      var pos = s + txt.length; try { campo.setSelectionRange(pos, pos); } catch (x) {}
      campo.focus(); campo.dispatchEvent(new Event('input', { bubbles: true }));
    }
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-emoji]');
      if (!b) return;
      montarPainel();
      alvoTexto = b.form ? b.form.querySelector('[data-texto]') : null;
      if (painel.hidden) {
        painel.hidden = false;
        var r = b.getBoundingClientRect(), pr = painel.getBoundingClientRect();
        var top = window.scrollY + r.top - pr.height - 8;
        if (top < window.scrollY + 8) top = window.scrollY + r.bottom + 8;
        var left = window.scrollX + Math.min(r.left, window.innerWidth - pr.width - 10);
        painel.style.top = top + 'px'; painel.style.left = Math.max(8, left) + 'px';
      } else { painel.hidden = true; }
    });

    // ----- Câmera (getUserMedia) — tela cheia estilo rede social: flip, obturador, zoom por pinça -----
    var camModal = null, camVideo = null, camZoomEl = null, camStream = null, camForm = null;
    var camFacing = 'environment', camTrocando = false;
    var camZoom = 1, camZoomMax = 5, camUsaZoomNativo = false;
    var zPtrs = {}, zPinch0 = 0, zZoom0 = 1, zTap = 0;
    var FLIP_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';

    function montarCamera() {
      if (camModal) return;
      camModal = document.createElement('div'); camModal.className = 'cam-modal'; camModal.hidden = true;
      camModal.innerHTML =
        '<video class="cam-video" autoplay playsinline muted></video>'
        + '<div class="cam-topo">'
        + '<button type="button" class="cam-x" data-cam-cancelar aria-label="Fechar">&times;</button>'
        + '<button type="button" class="cam-flip" data-cam-flip aria-label="Virar câmera (frontal/traseira)">' + FLIP_SVG + '</button>'
        + '</div>'
        + '<div class="cam-zoom" data-cam-zoom hidden>1.0x</div>'
        + '<div class="cam-barra"><button type="button" class="cam-shutter" data-cam-capturar aria-label="Tirar foto"></button></div>';
      document.body.appendChild(camModal);
      camVideo = camModal.querySelector('video');
      camZoomEl = camModal.querySelector('[data-cam-zoom]');
      camModal.querySelector('[data-cam-cancelar]').addEventListener('click', fecharCamera);
      camModal.querySelector('[data-cam-capturar]').addEventListener('click', capturar);
      camModal.querySelector('[data-cam-flip]').addEventListener('click', virarCamera);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && camModal && !camModal.hidden) fecharCamera(); });

      // Zoom: pinça (2 dedos) + duplo-toque alterna 1x/2x
      camVideo.addEventListener('pointerdown', function (e) {
        zPtrs[e.pointerId] = { x: e.clientX, y: e.clientY };
        var ids = Object.keys(zPtrs);
        if (ids.length === 2) {
          var a = zPtrs[ids[0]], b = zPtrs[ids[1]];
          zPinch0 = Math.hypot(a.x - b.x, a.y - b.y); zZoom0 = camZoom;
        } else if (ids.length === 1) {
          var agora = Date.now();
          if (agora - zTap < 300) { setZoom(camZoom > 1.5 ? 1 : 2); zTap = 0; } else zTap = agora;
        }
      });
      camVideo.addEventListener('pointermove', function (e) {
        if (!zPtrs[e.pointerId]) return;
        zPtrs[e.pointerId].x = e.clientX; zPtrs[e.pointerId].y = e.clientY;
        var ids = Object.keys(zPtrs);
        if (ids.length === 2 && zPinch0) {
          var a = zPtrs[ids[0]], b = zPtrs[ids[1]];
          setZoom(zZoom0 * (Math.hypot(a.x - b.x, a.y - b.y) / zPinch0));
        }
      });
      function zUp(e) { delete zPtrs[e.pointerId]; if (Object.keys(zPtrs).length < 2) zPinch0 = 0; }
      camVideo.addEventListener('pointerup', zUp);
      camVideo.addEventListener('pointercancel', zUp);
    }

    function pararStream() {
      if (camStream) { camStream.getTracks().forEach(function (t) { t.stop(); }); camStream = null; }
    }
    function aplicarZoomVisual() {
      var m = (camFacing === 'user') ? -1 : 1;                 // selfie espelhada
      var z = camUsaZoomNativo ? 1 : camZoom;                  // zoom nativo já mexe no stream
      camVideo.style.transform = 'scaleX(' + m + ') scale(' + z + ')';
    }
    function atualizarZoomBadge() {
      if (!camZoomEl) return;
      if (camZoom <= 1.02) { camZoomEl.hidden = true; }
      else { camZoomEl.hidden = false; camZoomEl.textContent = camZoom.toFixed(1) + 'x'; }
    }
    function setZoom(z) {
      camZoom = Math.max(1, Math.min(camZoomMax, z));
      if (camUsaZoomNativo && camStream) {
        try {
          var track = camStream.getVideoTracks()[0];
          var caps = track.getCapabilities ? track.getCapabilities() : {};
          if (caps.zoom) {
            var nz = caps.zoom.min + (caps.zoom.max - caps.zoom.min) * ((camZoom - 1) / (camZoomMax - 1));
            track.applyConstraints({ advanced: [{ zoom: nz }] }).catch(function () {});
          }
        } catch (e) {}
      }
      aplicarZoomVisual(); atualizarZoomBadge();
    }
    // Abre o stream na câmera atual (camFacing). Detecta zoom nativo (hardware).
    function abrirStream() {
      pararStream();
      return navigator.mediaDevices.getUserMedia({ video: { facingMode: camFacing }, audio: false })
        .then(function (s) {
          camStream = s; camVideo.srcObject = s; camZoom = 1; camUsaZoomNativo = false; camZoomMax = 5;
          try {
            var track = s.getVideoTracks()[0];
            var caps = track.getCapabilities ? track.getCapabilities() : null;
            if (caps && caps.zoom && caps.zoom.max > caps.zoom.min) { camUsaZoomNativo = true; camZoomMax = 6; }
          } catch (e) {}
          aplicarZoomVisual(); atualizarZoomBadge();
        });
    }
    function virarCamera() {
      if (camTrocando) return;
      camTrocando = true;
      var anterior = camFacing;
      camFacing = (camFacing === 'user') ? 'environment' : 'user';
      abrirStream()
        .catch(function () { camFacing = anterior; return abrirStream().catch(function () {}); }) // sem a outra câmera: volta
        .then(function () { camTrocando = false; });
    }
    function fecharCamera() { pararStream(); zPtrs = {}; zPinch0 = 0; document.body.classList.remove('sem-scroll'); if (camModal) camModal.hidden = true; }

    function capturar() {
      var VW = camVideo.videoWidth, VH = camVideo.videoHeight;
      if (!VW) return;
      // Tamanho do QUADRO visível (container, sem o transform de zoom do vídeo).
      var CW = camModal.clientWidth || window.innerWidth || VW;
      var CH = camModal.clientHeight || window.innerHeight || VH;
      // Recorta o retângulo REALMENTE visível (object-fit:cover) já com o zoom aplicado — a foto sai igual ao preview.
      var cover = Math.max(CW / VW, CH / VH);
      var dz = camUsaZoomNativo ? 1 : camZoom;                 // zoom nativo já veio no frame
      var sw = Math.min(VW, CW / (cover * dz));
      var sh = Math.min(VH, CH / (cover * dz));
      var sx = (VW - sw) / 2, sy = (VH - sh) / 2;
      var outW = Math.round(sw), outH = Math.round(sh);
      var cv = document.createElement('canvas'); cv.width = outW; cv.height = outH;
      var ctx = cv.getContext('2d');
      if (camFacing === 'user') { ctx.translate(outW, 0); ctx.scale(-1, 1); } // selfie espelhada, igual ao preview
      ctx.drawImage(camVideo, sx, sy, sw, sh, 0, 0, outW, outH);
      cv.toBlob(function (blob) {
        if (blob && camForm) {
          var input = camForm.querySelector('[data-foto]');
          if (input) {
            try {
              var dt = new DataTransfer();
              dt.items.add(new File([blob], 'foto.jpg', { type: 'image/jpeg' }));
              input.files = dt.files;
              input.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (x) {}
          }
        }
        fecharCamera();
      }, 'image/jpeg', 0.9);
    }
    function captureFallback(b) {
      var input = b.form && b.form.querySelector('[data-foto]');
      if (input) { input.setAttribute('capture', 'environment'); input.click(); }
    }
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-camera]');
      if (!b) return;
      camForm = b.form;
      camFacing = 'environment'; // começa na traseira; usuário pode virar
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        montarCamera(); camModal.hidden = false; document.body.classList.add('sem-scroll');
        abrirStream().catch(function () { fecharCamera(); captureFallback(b); });
      } else { captureFallback(b); }
    });
  })();

  /* ---------- Data de nascimento: seletores Dia/Mês/Ano (sem o popup nativo do navegador) ---------- */
  (function () {
    var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    document.querySelectorAll('[data-data-nasc]').forEach(function (wrap) {
      var hid = wrap.querySelector('input[type="hidden"]');
      var sDia = wrap.querySelector('[data-dn-dia]');
      var sMes = wrap.querySelector('[data-dn-mes]');
      var sAno = wrap.querySelector('[data-dn-ano]');
      if (!hid || !sDia || !sMes || !sAno) return;

      var hoje = new Date();
      var v = /^(\d{4})-(\d{2})-(\d{2})/.exec(hid.value || '');
      var ano = v ? +v[1] : 0, mes = v ? +v[2] : 0, dia = v ? +v[3] : 0;

      function opt(sel, valor, rotulo, selecionado) {
        var o = document.createElement('option');
        o.value = valor; o.textContent = rotulo;
        if (selecionado) o.selected = true;
        sel.appendChild(o);
      }
      // fevereiro/meses curtos: a lista de dias encolhe conforme mês/ano escolhidos
      function diasNoMes(m, a) { return m ? new Date(a || 2000, m, 0).getDate() : 31; }
      function montarDias() {
        var max = diasNoMes(+sMes.value, +sAno.value);
        var atual = +sDia.value || dia;
        if (atual > max) atual = 0;
        sDia.innerHTML = '';
        opt(sDia, '', 'Dia', !atual);
        for (var d = 1; d <= max; d++) opt(sDia, d, d, d === atual);
      }
      opt(sMes, '', 'Mês', !mes);
      MESES.forEach(function (nome, i) { opt(sMes, i + 1, nome, i + 1 === mes); });
      opt(sAno, '', 'Ano', !ano);
      for (var a = hoje.getFullYear(); a >= hoje.getFullYear() - 100; a--) opt(sAno, a, a, a === ano);
      montarDias();

      wrap.addEventListener('change', function (e) {
        if (e.target === sMes || e.target === sAno) montarDias();
        var d = +sDia.value, m = +sMes.value, a = +sAno.value;
        hid.value = (d && m && a)
          ? a + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0')
          : '';
      });
    });
  })();

  /* ---------- Contadores que "sobem" ---------- */
  function contarNumeros() {
    var nums = document.querySelectorAll('.numero');
    nums.forEach(function (el) {
      var alvo = parseInt((el.textContent || '').replace(/\D/g, ''), 10);
      if (isNaN(alvo) || alvo <= 0) return;
      var dur = 750, ini = null;
      el.textContent = '0';
      function passo(t) {
        if (!ini) ini = t;
        var p = Math.min((t - ini) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(eased * alvo);
        if (p < 1) requestAnimationFrame(passo);
      }
      requestAnimationFrame(passo);
    });
  }

  /* ---------- Revelar conteúdo com stagger ---------- */
  function revelar(rapido) {
    document.documentElement.classList.remove('preparando');
    document.body.classList.add('pronto');
    var passo = rapido ? 32 : 75;
    var alvos = document.querySelectorAll('.container > *:not(.modal)');
    alvos.forEach(function (el, i) {
      el.style.setProperty('--d', (i * passo) + 'ms');
      el.classList.add('reveal');
    });
    setTimeout(contarNumeros, rapido ? 100 : 250);
  }

  function removerLoader(loader) { if (loader && loader.parentNode) loader.parentNode.removeChild(loader); }

  /* ---------- Tela de carregamento ---------- */
  var loader = document.getElementById('loader');
  var mini = document.documentElement.classList.contains('mini');

  if (loader && !mini) {
    // Primeira entrada da sessão: anjo desenhando (cortina sobe).
    document.body.classList.add('travado');
    try { sessionStorage.setItem('anjoVisto', '1'); } catch (e) {}
    window.setTimeout(function () {
      loader.classList.add('subindo');
      document.body.classList.remove('travado');
      revelar(false);
      window.setTimeout(function () { removerLoader(loader); }, 900);
    }, 1650);
  } else {
    // Navegação / F5: sem loader — conteúdo aparece na hora.
    removerLoader(loader);
    revelar(true);
  }
})();
