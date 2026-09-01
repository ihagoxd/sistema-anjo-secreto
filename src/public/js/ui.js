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
  // Pinça com 2 dedos fora das áreas com zoom próprio: bloqueia o zoom DA PÁGINA
  // (Chrome/Android e iOS que ignoram user-scalable=no no viewport)
  document.addEventListener('touchmove', function (e) {
    if (e.touches.length < 2) return;
    if (e.target.closest('.lightbox, .cam-modal, .stview, .stcomp, .tw-post-midia, .cropper, #cropper')) return;
    e.preventDefault();
  }, { passive: false });

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
          // incrementa o contador do ícone e o "Ver todos os N comentários"
          var art = bloco.closest('.tw-post');
          if (art) {
            var span = art.querySelector('.tw-acao .post-coments');
            var n = (parseInt(span && span.textContent, 10) || 0) + 1;
            if (span) span.textContent = n;
            var ver = art.querySelector('.ig-vercoments');
            if (ver) { ver.hidden = false; ver.textContent = n === 1 ? 'Ver 1 comentário' : 'Ver todos os ' + n + ' comentários'; }
          }
        })
        .catch(function () { toast('Não foi possível comentar.'); })
        .finally(function () { if (btn) btn.disabled = false; });
    });
  })();

  /* ---------- Legenda longa: corta em 2 linhas com "mais" (estilo Instagram) ---------- */
  (function () {
    document.querySelectorAll('.ig-legenda').forEach(function (leg) {
      leg.classList.add('clampada');
      if (leg.scrollHeight <= leg.clientHeight + 2) { leg.classList.remove('clampada'); return; }
      var mais = document.createElement('button');
      mais.type = 'button'; mais.className = 'ig-mais'; mais.textContent = 'mais';
      mais.addEventListener('click', function () { leg.classList.remove('clampada'); mais.remove(); });
      leg.insertAdjacentElement('afterend', mais);
    });
  })();

  /* ---------- Pesquisa de usuários (tela estilo Instagram) ----------
     Lupa abre uma tela cheia com campo de busca; resultados ao vivo (debounce),
     "Recentes" no localStorage (com X por item e "Limpar tudo"), clique entra
     no perfil. ---------- */
  (function () {
    var tela = document.getElementById('buscaTela');
    if (!tela) return;
    var inp = tela.querySelector('#buscaInput');
    var lista = tela.querySelector('.busca-lista');
    var cabRec = tela.querySelector('.busca-recentes-cab');
    var btnLimparCampo = tela.querySelector('[data-busca-limpar-campo]');
    var timer = null, seq = 0, porUser = {};

    function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
    function lerRecentes() { try { return JSON.parse(localStorage.getItem('buscaRecentes') || '[]'); } catch (e) { return []; } }
    function salvarRecentes(l) { try { localStorage.setItem('buscaRecentes', JSON.stringify(l.slice(0, 8))); } catch (e) {} }

    function itemHtml(p, comRemover) {
      porUser[p.usuario] = p;
      var av = p.foto_perfil ? '<img src="' + esc(p.foto_perfil) + '" alt="">' : esc((p.nome || '?').trim().charAt(0).toUpperCase());
      return '<a class="share-item busca-item" href="/u/' + encodeURIComponent(p.usuario) + '" data-busca-user="' + esc(p.usuario) + '">'
        + '<span class="share-av">' + av + '</span>'
        + '<span class="share-txt"><span class="share-nome">' + esc(p.nome) + '</span><span class="share-user">@' + esc(p.usuario) + '</span></span>'
        + (comRemover ? '<button type="button" class="busca-remover" data-busca-remover="' + esc(p.usuario) + '" aria-label="Remover dos recentes">&times;</button>' : '')
        + '</a>';
    }
    // Estado inicial da tela: "Recentes" (localStorage) + "Sugestões" com os usuários cadastrados.
    // As sugestões ficam em cache: a tela abre instantânea (sem a lista "pular" depois).
    var sugCache = null;
    function mostrarInicio() {
      var rec = lerRecentes();
      cabRec.hidden = !rec.length;
      var htmlRec = rec.map(function (p) { return itemHtml(p, true); }).join('');
      function render(pessoas) {
        var jaTem = {};
        rec.forEach(function (p) { jaTem[p.usuario] = true; });
        var sug = (pessoas || []).filter(function (p) { return !jaTem[p.usuario]; });
        if (sug.length) {
          lista.innerHTML = htmlRec + '<div class="busca-subtitulo">Sugestões</div>'
            + sug.map(function (p) { return itemHtml(p, false); }).join('');
        } else if (rec.length) {
          lista.innerHTML = htmlRec;
        } else {
          lista.innerHTML = '<div class="texto-suave busca-vazio">Pesquise os colegas pelo nome ou @usuário.</div>';
        }
      }
      render(sugCache);
      fetch('/buscar?q=', { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function (pessoas) {
          sugCache = pessoas;
          if (tela.hidden || inp.value.trim()) return; // já fechou ou já começou a digitar
          render(pessoas);
        })
        .catch(function () {});
    }
    function abrir() {
      tela.hidden = false;
      var mobile = window.matchMedia('(max-width: 899px)').matches;
      // Só o mobile trava o scroll do fundo; no desktop a página continua visível ao lado
      if (mobile) document.body.classList.add('sem-scroll');
      inp.value = ''; btnLimparCampo.hidden = true;
      mostrarInicio();
      // No celular NÃO foca sozinho: o teclado subindo na abertura causava a "engasgada"
      // (igual ao Instagram: o teclado só abre quando a pessoa toca no campo)
      if (!mobile) window.setTimeout(function () { inp.focus(); }, 60);
    }
    function fechar() { tela.hidden = true; document.body.classList.remove('sem-scroll'); }

    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-busca-abrir]')) { abrir(); return; }
      if (e.target.closest('[data-busca-fechar]')) { fechar(); return; }
      var rem = e.target.closest('[data-busca-remover]');
      if (rem) {
        e.preventDefault(); e.stopPropagation();
        salvarRecentes(lerRecentes().filter(function (p) { return p.usuario !== rem.getAttribute('data-busca-remover'); }));
        mostrarInicio();
        return;
      }
      if (e.target.closest('[data-busca-limpar-recentes]')) { salvarRecentes([]); mostrarInicio(); return; }
      if (e.target.closest('[data-busca-limpar-campo]')) { inp.value = ''; btnLimparCampo.hidden = true; mostrarInicio(); inp.focus(); return; }
      var it = e.target.closest('.busca-item');
      if (it) {
        // guarda nos recentes e deixa o link navegar normalmente para o perfil
        var p = porUser[it.getAttribute('data-busca-user')];
        if (p) {
          var rec = lerRecentes().filter(function (r) { return r.usuario !== p.usuario; });
          rec.unshift({ usuario: p.usuario, nome: p.nome, foto_perfil: p.foto_perfil || '' });
          salvarRecentes(rec);
        }
      }
    });

    inp.addEventListener('input', function () {
      var q = inp.value.trim();
      btnLimparCampo.hidden = !inp.value;
      clearTimeout(timer);
      if (!q) { mostrarInicio(); return; }
      timer = setTimeout(function () {
        var minha = ++seq;
        fetch('/buscar?q=' + encodeURIComponent(q), { headers: { 'Accept': 'application/json' } })
          .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
          .then(function (pessoas) {
            if (minha !== seq || inp.value.trim() !== q) return; // resposta atrasada: ignora
            cabRec.hidden = true;
            lista.innerHTML = pessoas.length
              ? pessoas.map(function (p) { return itemHtml(p, false); }).join('')
              : '<div class="texto-suave busca-vazio">Ninguém encontrado para “' + esc(q) + '”.</div>';
          })
          .catch(function () {});
      }, 220);
    });

    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !tela.hidden) fechar(); });

    // Clicar fora do painel fecha a busca (no desktop o resto da página fica visível ao lado)
    document.addEventListener('click', function (e) {
      if (tela.hidden) return;
      if (e.target.closest('.busca-tela') || e.target.closest('[data-busca-abrir]')) return;
      fechar();
    });
  })();

  /* ---------- Stories (estilo Instagram) ----------
     Publicar: folha com Câmera / Foto / Vídeo → o form #formStory envia o arquivo
     INTACTO (qualidade original). Assistir: visualizador em tela cheia com barras
     de progresso, toque avança/volta, segurar pausa, arrastar para baixo fecha. */
  (function () {
    var metaCsrfSt = document.querySelector('meta[name="csrf-token"]');
    var CSRF = metaCsrfSt ? metaCsrfSt.getAttribute('content') : '';

    // --- Publicar: o + abre direto a galeria do celular (foto OU vídeo num seletor só).
    // Depois de escolher, abre o COMPOSITOR (preview em tela cheia + "Compartilhar no
    // story", como no Instagram) e publica por AJAX — sem recarregar a página. ---
    document.addEventListener('click', function (e) {
      if (!e.target.closest('[data-add-story]')) return;
      var form = document.getElementById('formStory');
      var picker = form && form.querySelector('[data-story-picker]');
      if (picker) { picker.value = ''; picker.click(); }
    });

    var comp = null, compFile = null, compEhVideo = false, compUrl = '';
    function montarComposer() {
      if (comp) return;
      comp = document.createElement('div');
      comp.className = 'stcomp';
      comp.hidden = true;
      comp.innerHTML =
        '<div class="stview-cab"><span class="stview-nome">Novo story</span>'
        + '<button type="button" class="stview-x" data-comp-fechar aria-label="Cancelar">&times;</button></div>'
        + '<div class="stcomp-media"></div>'
        + '<button type="button" class="btn btn-primario stcomp-enviar">Compartilhar no story</button>';
      document.body.appendChild(comp);
      comp.querySelector('[data-comp-fechar]').addEventListener('click', fecharComposer);
      comp.querySelector('.stcomp-enviar').addEventListener('click', enviarStory);
    }
    function fecharComposer() {
      if (!comp) return;
      comp.hidden = true;
      document.body.classList.remove('sem-scroll');
      if (compUrl) { URL.revokeObjectURL(compUrl); compUrl = ''; }
      compFile = null;
    }
    function abrirComposer(file, ehVideo) {
      montarComposer();
      compFile = file; compEhVideo = ehVideo;
      if (compUrl) URL.revokeObjectURL(compUrl);
      compUrl = URL.createObjectURL(file);
      var box = comp.querySelector('.stcomp-media');
      box.innerHTML = '';
      if (ehVideo) {
        var v = document.createElement('video');
        v.src = compUrl; v.controls = false; v.autoplay = true; v.muted = true; v.loop = true; v.playsInline = true;
        box.appendChild(v);
      } else {
        var img = document.createElement('img');
        img.src = compUrl; img.alt = '';
        box.appendChild(img);
      }
      var btn = comp.querySelector('.stcomp-enviar');
      btn.disabled = false; btn.textContent = 'Compartilhar no story';
      comp.hidden = false;
      document.body.classList.add('sem-scroll');
    }
    function enviarStory() {
      if (!compFile) return;
      var form = document.getElementById('formStory');
      var btn = comp.querySelector('.stcomp-enviar');
      btn.disabled = true; btn.textContent = 'Publicando…';
      var fd = new FormData();
      var tk = form && form.querySelector('input[name="_csrf"]');
      if (tk) fd.append('_csrf', tk.value);
      fd.append(compEhVideo ? 'video' : 'imagem', compFile, compFile.name || (compEhVideo ? 'story.mp4' : 'story.jpg'));
      fetch('/stories', { method: 'POST', headers: { 'X-Requested-With': 'fetch', 'Accept': 'application/json' }, body: fd })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function () {
          fecharComposer();
          toast('Story publicado ✨');
          // Anel "Seu story" vira dourado na hora, sem recarregar
          var anel = document.querySelector('.story-ring.eu-story');
          if (anel) {
            anel.classList.remove('sem'); anel.classList.add('tem');
            var meuId = anel.getAttribute('data-meu-id');
            if (meuId) { anel.setAttribute('data-ver-stories', meuId); anel.removeAttribute('data-add-story'); }
          }
        })
        .catch(function () {
          btn.disabled = false; btn.textContent = 'Compartilhar no story';
          toast('Não foi possível publicar. Tente de novo.');
        });
    }

    document.addEventListener('change', function (e) {
      var form = e.target.form;
      if (!form || form.id !== 'formStory') return;
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var ehVideo = e.target.hasAttribute('data-story-picker')
        ? file.type.indexOf('video/') === 0
        : e.target.hasAttribute('data-video');
      e.target.value = ''; // libera para escolher de novo depois
      abrirComposer(file, ehVideo);
    });

    // --- Visualizador ---
    var view = null, barras = null, mediaBox = null, avEl = null, nomeEl = null, tempoEl = null,
      vistosEl = null, delBtn = null, somBtn = null;
    var grupos = [], gi = 0, ii = 0;
    var raf = 0, t0 = 0, decorrido = 0, dur = 5000, pausado = false, videoEl = null;
    var pressT = 0, swipeY = -1, mostrarSeq = 0;

    function tempoRelJs(iso) {
      var seg = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
      if (seg < 60) return 'agora';
      if (seg < 3600) return Math.floor(seg / 60) + ' min';
      return Math.floor(seg / 3600) + ' h';
    }
    function escSt(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

    function montarView() {
      if (view) return;
      view = document.createElement('div');
      view.className = 'stview';
      view.hidden = true;
      view.innerHTML =
        '<div class="stview-progresso"></div>'
        + '<div class="stview-cab">'
        + '  <span class="stview-av"></span>'
        + '  <span class="stview-nome"></span><span class="stview-tempo"></span>'
        + '  <button type="button" class="stview-som" hidden aria-label="Som">🔊</button>'
        + '  <button type="button" class="stview-x" aria-label="Fechar">&times;</button>'
        + '</div>'
        + '<div class="stview-media"></div>'
        + '<div class="stview-tap prev" aria-hidden="true"></div>'
        + '<div class="stview-tap next" aria-hidden="true"></div>'
        + '<div class="stview-vistos" hidden></div>'
        + '<button type="button" class="stview-del" hidden>Apagar story</button>';
      document.body.appendChild(view);
      barras = view.querySelector('.stview-progresso');
      mediaBox = view.querySelector('.stview-media');
      avEl = view.querySelector('.stview-av');
      nomeEl = view.querySelector('.stview-nome');
      tempoEl = view.querySelector('.stview-tempo');
      vistosEl = view.querySelector('.stview-vistos');
      delBtn = view.querySelector('.stview-del');
      somBtn = view.querySelector('.stview-som');

      view.querySelector('.stview-x').addEventListener('click', fecharView);
      somBtn.addEventListener('click', function () {
        if (!videoEl) return;
        videoEl.muted = !videoEl.muted;
        somBtn.textContent = videoEl.muted ? '🔇' : '🔊';
      });
      delBtn.addEventListener('click', function () {
        var item = grupos[gi] && grupos[gi].itens[ii];
        if (!item) return;
        if (delBtn.dataset.confirmando !== '1') {
          delBtn.dataset.confirmando = '1';
          delBtn.textContent = 'Apagar mesmo?';
          setTimeout(function () { delBtn.dataset.confirmando = ''; delBtn.textContent = 'Apagar story'; }, 2600);
          return;
        }
        fetch('/stories/' + item.id_story + '/remover', { method: 'POST', headers: { 'X-CSRF-Token': CSRF, 'X-Requested-With': 'fetch' } })
          .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
          .then(function () { window.location.reload(); })
          .catch(function () { toast('Não foi possível apagar.'); });
      });

      // Toque: soltar rápido = navega; segurar = pausa. Arrastar para baixo fecha.
      ['prev', 'next'].forEach(function (lado) {
        var zona = view.querySelector('.stview-tap.' + lado);
        zona.addEventListener('pointerdown', function (e) {
          pressT = Date.now(); swipeY = e.clientY; pausar(true);
        });
        zona.addEventListener('pointerup', function (e) {
          var segurou = Date.now() - pressT > 260;
          var desceu = swipeY >= 0 && (e.clientY - swipeY) > 80;
          swipeY = -1;
          if (desceu) { fecharView(); return; }
          pausar(false);
          if (!segurou) (lado === 'prev' ? anterior() : proximo());
        });
        zona.addEventListener('pointercancel', function () { swipeY = -1; pausar(false); });
      });
    }

    function pausar(sim) {
      pausado = sim;
      if (videoEl) { if (sim) videoEl.pause(); else videoEl.play().catch(function () {}); }
      else if (sim) { decorrido += performance.now() - t0; cancelAnimationFrame(raf); }
      else if (!view.classList.contains('carregando')) { t0 = performance.now(); raf = requestAnimationFrame(tick); }
    }

    function barrasHtml(n) {
      var h = '';
      for (var i = 0; i < n; i++) h += '<span class="stbar"><i></i></span>';
      barras.innerHTML = h;
    }
    function setBarra(idx, frac) {
      var el = barras.children[idx] && barras.children[idx].firstChild;
      if (el) el.style.width = (Math.max(0, Math.min(1, frac)) * 100) + '%';
    }

    function tick() {
      if (pausado) return;
      var frac = (decorrido + performance.now() - t0) / dur;
      setBarra(ii, frac);
      if (frac >= 1) { proximo(); return; }
      raf = requestAnimationFrame(tick);
    }

    function pararTempo() { cancelAnimationFrame(raf); if (videoEl) { try { videoEl.pause(); } catch (e) {} videoEl = null; } }

    function mostrar() {
      var g = grupos[gi];
      if (!g) { fecharView(); return; }
      var item = g.itens[ii];
      pararTempo();
      pausado = false; decorrido = 0;

      barrasHtml(g.itens.length);
      for (var i = 0; i < ii; i++) setBarra(i, 1);

      avEl.innerHTML = g.foto_perfil ? '<img src="' + escSt(g.foto_perfil) + '" alt="">' : escSt((g.nome || '?').trim().charAt(0).toUpperCase());
      nomeEl.textContent = g.usuario;
      tempoEl.textContent = tempoRelJs(item.criado_em);
      delBtn.hidden = !g.eu; delBtn.dataset.confirmando = ''; delBtn.textContent = 'Apagar story';
      vistosEl.hidden = !g.eu;
      if (g.eu) vistosEl.textContent = '👁 ' + (item.vistos || 0) + (item.vistos === 1 ? ' visualização' : ' visualizações');
      somBtn.hidden = !item.video;

      mediaBox.innerHTML = '';
      var seq = ++mostrarSeq;
      view.classList.add('carregando');
      if (item.video) {
        videoEl = document.createElement('video');
        videoEl.src = item.video; videoEl.playsInline = true; videoEl.autoplay = true;
        videoEl.addEventListener('loadedmetadata', function () { dur = Math.max(1000, (videoEl.duration || 10) * 1000); });
        videoEl.addEventListener('playing', function () { if (seq === mostrarSeq) view.classList.remove('carregando'); });
        videoEl.addEventListener('timeupdate', function () { if (videoEl && videoEl.duration) setBarra(ii, videoEl.currentTime / videoEl.duration); });
        videoEl.addEventListener('ended', proximo);
        mediaBox.appendChild(videoEl);
        videoEl.muted = false;
        somBtn.textContent = '🔊';
        videoEl.play().catch(function () { // autoplay com som bloqueado: toca mudo e mostra o botão
          if (!videoEl) return;
          videoEl.muted = true; somBtn.textContent = '🔇';
          videoEl.play().catch(function () {});
        });
      } else {
        var img = document.createElement('img');
        img.src = item.imagem; img.alt = '';
        mediaBox.appendChild(img);
        dur = 5000;
        // A barra SÓ começa quando a foto está decodificada (nada de contar no escuro)
        var iniciar = function () {
          if (seq !== mostrarSeq) return; // já navegou para outro story
          view.classList.remove('carregando');
          decorrido = 0; t0 = performance.now();
          raf = requestAnimationFrame(tick);
        };
        if (img.decode) img.decode().then(iniciar).catch(iniciar);
        else if (img.complete) iniciar();
        else { img.onload = iniciar; img.onerror = iniciar; }
      }
      preCarregar(); // próximo story baixa em segundo plano (transição instantânea)

      if (!g.eu && !item.visto) {
        item.visto = true;
        fetch('/stories/' + item.id_story + '/visto', { method: 'POST', headers: { 'X-CSRF-Token': CSRF, 'X-Requested-With': 'fetch' } }).catch(function () {});
      }
    }

    // Pré-carrega a próxima mídia (do mesmo grupo ou o 1º do grupo seguinte)
    function preCarregar() {
      var g = grupos[gi];
      var prox = (g && g.itens[ii + 1]) || (grupos[gi + 1] && grupos[gi + 1].itens[0]);
      if (prox && prox.imagem) { var im = new Image(); im.src = prox.imagem; }
    }

    function proximo() {
      var g = grupos[gi];
      if (ii < g.itens.length - 1) { ii++; mostrar(); return; }
      if (gi < grupos.length - 1) { gi++; ii = 0; mostrar(); return; }
      fecharView();
    }
    function anterior() {
      if (ii > 0) { ii--; mostrar(); return; }
      if (gi > 0) { gi--; ii = grupos[gi].itens.length - 1; mostrar(); return; }
      mostrar(); // primeiro de todos: recomeça o atual
    }

    function atualizarAneis() {
      grupos.forEach(function (g) {
        var tudo = g.itens.every(function (it) { return it.visto || g.eu; });
        var anel = document.querySelector('[data-ver-stories="' + g.id_usuario + '"] .story-ring, .story-ring[data-ver-stories="' + g.id_usuario + '"]');
        if (anel && tudo && !g.eu) { anel.classList.remove('tem'); anel.classList.add('visto'); } // dourado apagado: postou e você já viu
      });
    }

    function fecharView() {
      pararTempo();
      if (view) view.hidden = true;
      document.body.classList.remove('sem-scroll');
      atualizarAneis();
    }

    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ver-stories]');
      if (!b) return;
      var idAlvo = parseInt(b.getAttribute('data-ver-stories'), 10);
      montarView();
      fetch('/stories/dados', { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function (gs) {
          if (!gs.length) return;
          grupos = gs;
          gi = Math.max(0, grupos.findIndex(function (g) { return g.id_usuario === idAlvo; }));
          // começa no primeiro não visto (como no Instagram); se viu todos, do início
          var g = grupos[gi];
          ii = g.itens.findIndex(function (it) { return !it.visto && !g.eu; });
          if (ii < 0) ii = 0;
          document.body.classList.add('sem-scroll');
          view.hidden = false;
          mostrar();
        })
        .catch(function () { toast('Não foi possível abrir os stories.'); });
    });

    document.addEventListener('keydown', function (e) {
      if (!view || view.hidden) return;
      if (e.key === 'Escape') fecharView();
      else if (e.key === 'ArrowRight') proximo();
      else if (e.key === 'ArrowLeft') anterior();
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
            if (d.curtidor) {
              var dv = document.createElement('div'); dv.textContent = d.curtidor;
              linha.innerHTML = 'Curtido por <strong>' + dv.innerHTML + '</strong>'
                + (n > 1 ? ' e <strong>outras pessoas</strong>' : '');
            } else {
              linha.innerHTML = '<strong>' + n + '</strong> curtida' + (n === 1 ? '' : 's');
            }
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
          if (c) c.textContent = (Number(d.total) || 0) ? d.total : ''; // zero: some, como no Instagram
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
    var ultTempo = 0, ultAlvo = null, tLB = null, pincaAte = 0;
    document.addEventListener('click', function (e) {
      var midia = e.target.closest('.tw-post-midia');
      if (!midia) return;
      if (Date.now() - pincaAte < 400) return; // acabou de pinçar: não abre lightbox nem curte
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

    /* ---- Pinça direto na foto do feed (estilo Instagram): dois dedos ampliam
       a imagem por cima da página (fundo escurece) e ao soltar ela volta sozinha.
       A imagem real é clonada numa camada fixed — assim nenhum overflow/stacking
       do card corta o zoom. ---- */
    (function () {
      var pAlvo = null, pClone = null, pVeu = null;
      var pD0 = 0, pCx0 = 0, pCy0 = 0;

      function pDist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
      function pCentro(t) { return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 }; }

      document.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 2 || pAlvo) return;
        var midia = e.target.closest('.tw-post-midia');
        var img = midia && midia.querySelector('img');
        if (!img) return;
        e.preventDefault();
        var r = img.getBoundingClientRect();
        pD0 = pDist(e.touches);
        var c = pCentro(e.touches); pCx0 = c.x; pCy0 = c.y;

        pVeu = document.createElement('div'); pVeu.className = 'pinca-veu';
        document.body.appendChild(pVeu);
        pClone = img.cloneNode();
        pClone.className = 'pinca-img';
        pClone.style.left = r.left + 'px'; pClone.style.top = r.top + 'px';
        pClone.style.width = r.width + 'px'; pClone.style.height = r.height + 'px';
        pClone.style.transformOrigin = (pCx0 - r.left) + 'px ' + (pCy0 - r.top) + 'px';
        document.body.appendChild(pClone);
        img.style.visibility = 'hidden';
        pAlvo = img;
      }, { passive: false });

      document.addEventListener('touchmove', function (e) {
        if (!pAlvo || e.touches.length < 2) return;
        e.preventDefault();
        var c = pCentro(e.touches);
        var esc = Math.max(1, Math.min(4, pDist(e.touches) / pD0));
        pClone.style.transform = 'translate(' + (c.x - pCx0) + 'px,' + (c.y - pCy0) + 'px) scale(' + esc + ')';
        pVeu.style.opacity = Math.min(0.7, (esc - 1) * 0.9);
      }, { passive: false });

      function pSoltar() {
        if (!pAlvo) return;
        pincaAte = Date.now();
        var img = pAlvo, cl = pClone, v = pVeu;
        pAlvo = null; pClone = null; pVeu = null;
        cl.style.transition = 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)';
        v.style.transition = 'opacity 0.28s ease';
        cl.style.transform = 'none'; v.style.opacity = '0';
        setTimeout(function () { img.style.visibility = ''; cl.remove(); v.remove(); }, 300);
      }
      document.addEventListener('touchend', function (e) { if (pAlvo && e.touches.length < 2) pSoltar(); });
      document.addEventListener('touchcancel', function () { pSoltar(); });
    })();

    /* ---- "N curtidas" → folha com quem curtiu (estilo Instagram) ---- */
    var curtModal = null;
    function escCurt(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
    document.addEventListener('click', function (e) {
      var alvo = e.target.closest('[data-vercurtidas]');
      if (!alvo) return;
      if (!curtModal) {
        curtModal = document.createElement('div');
        curtModal.className = 'modal sheet-share';
        curtModal.hidden = true;
        curtModal.setAttribute('aria-hidden', 'true');
        curtModal.innerHTML = '<div class="modal-card share-card">'
          + '<div class="sheet-cab sempre"><span class="sheet-grab" aria-hidden="true"></span>'
          + '<span class="sheet-titulo">Curtidas</span>'
          + '<button type="button" class="sheet-x" data-fechar-modal aria-label="Fechar">&times;</button></div>'
          + '<div class="share-lista curtidas-lista"></div></div>';
        document.body.appendChild(curtModal);
      }
      var lista = curtModal.querySelector('.curtidas-lista');
      lista.innerHTML = '<div class="texto-suave" style="padding:10px 6px;">Carregando…</div>';
      curtModal.hidden = false; curtModal.setAttribute('aria-hidden', 'false');
      fetch('/feed/' + alvo.getAttribute('data-vercurtidas') + '/curtidas', { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function (pessoas) {
          if (!pessoas.length) { lista.innerHTML = '<div class="texto-suave" style="padding:10px 6px;">Ninguém curtiu ainda.</div>'; return; }
          lista.innerHTML = pessoas.map(function (p) {
            var av = p.foto_perfil ? '<img src="' + escCurt(p.foto_perfil) + '" alt="">' : escCurt((p.nome || '?').trim().charAt(0).toUpperCase());
            return '<a class="share-item" href="/u/' + encodeURIComponent(p.usuario) + '">'
              + '<span class="share-av">' + av + '</span>'
              + '<span class="share-txt"><span class="share-nome">' + escCurt(p.nome) + '</span>'
              + '<span class="share-user">@' + escCurt(p.usuario) + '</span></span></a>';
          }).join('');
        })
        .catch(function () { lista.innerHTML = '<div class="texto-suave" style="padding:10px 6px;">Não foi possível carregar.</div>'; });
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
    function fecharShare() {
      var m = document.getElementById('modal-share');
      if (m) { m.setAttribute('hidden', ''); m.setAttribute('aria-hidden', 'true'); }
    }
    function atualizarRodapeShare() {
      var m = document.getElementById('modal-share');
      if (!m) return;
      var sels = m.querySelectorAll('[data-share-dm].sel').length;
      var rod = m.querySelector('[data-share-rodape]');
      var btn = m.querySelector('[data-share-enviar]');
      if (rod) rod.hidden = !sels;
      if (btn) { btn.disabled = false; btn.textContent = sels > 1 ? 'Enviar (' + sels + ')' : 'Enviar'; }
    }
    document.addEventListener('click', function (e) {
      var s = e.target.closest('[data-share]');
      if (s) {
        shareUrl = location.origin + s.getAttribute('data-share');
        var sheet = document.getElementById('modal-share');
        if (sheet) {
          // abre limpa: nada selecionado, rodapé escondido
          sheet.querySelectorAll('[data-share-dm].sel').forEach(function (el) { el.classList.remove('sel'); });
          atualizarRodapeShare();
          sheet.removeAttribute('hidden');
          sheet.setAttribute('aria-hidden', 'false');
        } else copiarLink(shareUrl);
        return;
      }
      // Seleciona/desmarca destinatários (pode ser mais de um, como no Instagram)
      var dm = e.target.closest('[data-share-dm]');
      if (dm) {
        dm.classList.toggle('sel');
        atualizarRodapeShare();
        return;
      }
      // Enviar para TODOS os selecionados de uma vez
      var env = e.target.closest('[data-share-enviar]');
      if (env && shareUrl) {
        var m = document.getElementById('modal-share');
        var alvos = Array.prototype.slice.call(m.querySelectorAll('[data-share-dm].sel'));
        if (!alvos.length) return;
        env.disabled = true;
        env.textContent = 'Enviando…';
        Promise.all(alvos.map(function (el) {
          var corpo = new URLSearchParams();
          corpo.set('mensagem', shareUrl);
          return fetch('/mensagens/u/' + el.getAttribute('data-share-dm'), {
            method: 'POST',
            headers: { 'X-CSRF-Token': CSRF, 'X-Requested-With': 'fetch' },
            body: corpo
          }).then(function (r) { if (!r.ok) throw new Error('falhou'); });
        }))
          .then(function () {
            toast(alvos.length > 1 ? 'Post enviado para ' + alvos.length + ' pessoas! ✈️' : 'Post enviado no Direct! ✈️');
            fecharShare();
          })
          .catch(function () {
            atualizarRodapeShare();
            toast('Não foi possível enviar para todo mundo. Tente de novo.');
          });
        return;
      }
      var cp = e.target.closest('[data-share-copiar]');
      if (cp) {
        copiarLink(shareUrl);
        fecharShare();
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

    // Mic quando vazio; botão de enviar quando tem texto, foto ou vídeo anexado
    var vid = form.querySelector('[data-video]');
    function temArq(i) { return !!(i && i.files && i.files.length); }
    function alternar() {
      var temAlgo = !!ta.value.trim() || temArq(foto) || temArq(vid);
      btnEnviar.hidden = !temAlgo;
      btnMic.hidden = temAlgo;
    }
    ta.addEventListener('input', alternar);
    if (foto) foto.addEventListener('change', alternar);
    if (vid) vid.addEventListener('change', alternar);
    alternar();

    // Forma de onda animada (estilo WhatsApp) — barrinhas criadas uma vez
    var onda = form.querySelector('.dm-onda');
    if (onda && !onda.childElementCount) {
      for (var i = 0; i < 26; i++) onda.appendChild(document.createElement('span'));
    }

    // ----- Filtro de voz (chat secreto do protegido): disfarça a voz JÁ na gravação -----
    var filtroBox = form.querySelector('[data-filtro-voz]');
    var vozSel = 'grave';
    if (filtroBox) filtroBox.addEventListener('click', function (e) {
      var b = e.target.closest('[data-voz]');
      if (!b) return;
      vozSel = b.getAttribute('data-voz');
      filtroBox.querySelectorAll('.dm-filtro-op').forEach(function (o) { o.classList.toggle('sel', o === b); });
    });

    // Pitch shift granular ("Jungle"): dois ramos de delay varridos por rampas
    // defasadas com crossfade — só nós nativos do Web Audio, roda em tempo real.
    function criarPitch(ctx, fator) {
      var T = 0.25, n = Math.round(ctx.sampleRate * T * 2);
      var rampa = [], fade = [];
      for (var k = 0; k < 2; k++) {
        rampa.push(ctx.createBuffer(1, n, ctx.sampleRate));
        fade.push(ctx.createBuffer(1, n, ctx.sampleRate));
      }
      for (var i = 0; i < n; i++) {
        var t = (i / n) * 2;
        for (var j = 0; j < 2; j++) {
          var fase = (t + j) % 2; // cada ramo ativo em metade do ciclo, defasados
          var ativo = fase < 1;
          rampa[j].getChannelData(0)[i] = ativo ? fase : 0;
          var f = 0;
          if (ativo) {
            var borda = 0.12;
            f = fase < borda ? fase / borda : fase > 1 - borda ? (1 - fase) / borda : 1;
          }
          fade[j].getChannelData(0)[i] = f;
        }
      }
      var ent = ctx.createGain(), sai = ctx.createGain();
      var prof = (1 - fator) * T; // varredura do delay durante o grão (negativa = agudo)
      for (var k2 = 0; k2 < 2; k2++) {
        var del = ctx.createDelay(1);
        del.delayTime.value = 0.05 + Math.max(0, -prof);
        var sR = ctx.createBufferSource(); sR.buffer = rampa[k2]; sR.loop = true;
        var gR = ctx.createGain(); gR.gain.value = prof;
        sR.connect(gR); gR.connect(del.delayTime);
        var sF = ctx.createBufferSource(); sF.buffer = fade[k2]; sF.loop = true;
        var gF = ctx.createGain(); gF.gain.value = 0;
        sF.connect(gF.gain);
        ent.connect(del); del.connect(gF); gF.connect(sai);
        sR.start(0); sF.start(0);
      }
      return { entrada: ent, saida: sai };
    }

    // Devolve o stream que o gravador deve usar: processado (voz disfarçada) ou o original.
    var vozCtx = null;
    function prepararVoz(s) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!filtroBox || vozSel === 'normal' || !AC) return s;
      try {
        vozCtx = new AC();
        var src = vozCtx.createMediaStreamSource(s);
        var dest = vozCtx.createMediaStreamDestination();
        if (vozSel === 'robo') {
          // Modulador em anel (~45 Hz) + banda de "rádio": voz de robô clássica
          var osc = vozCtx.createOscillator(); osc.frequency.value = 45; osc.start();
          var anel = vozCtx.createGain(); anel.gain.value = 0;
          osc.connect(anel.gain);
          var bp = vozCtx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.5;
          src.connect(anel); anel.connect(bp); bp.connect(dest);
        } else {
          var p = criarPitch(vozCtx, vozSel === 'grave' ? 0.74 : 1.34);
          src.connect(p.entrada); p.saida.connect(dest);
        }
        return dest.stream;
      } catch (x) {
        if (vozCtx) { try { vozCtx.close(); } catch (e2) {} vozCtx = null; }
        return s;
      }
    }

    var rec = null, pedacos = [], stream = null, timer = null, t0 = 0, decorrido = 0, enviarAoParar = false;
    function fmt(s) { var m = Math.floor(s / 60), ss = Math.floor(s % 60); return m + ':' + (ss < 10 ? '0' : '') + ss; }
    function tempoTotal() { return decorrido + (rec && rec.state === 'recording' ? Date.now() - t0 : 0); }

    // Onda AO VIVO: as barrinhas seguem o volume real do microfone (Web Audio).
    // Se o navegador não tiver AudioContext, fica a animação decorativa do CSS.
    var audioCtx = null, analyser = null, rafOnda = 0, barras = [];
    function desenharOnda() {
      rafOnda = requestAnimationFrame(desenharOnda);
      var dados = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dados);
      for (var i = 0; i < barras.length; i++) {
        var v = dados[Math.min(i + 2, dados.length - 1)] / 255;
        barras[i].style.height = Math.max(12, Math.round(v * 100)) + '%';
      }
    }
    function ligarOnda(s) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC || !onda) return;
        audioCtx = new AC();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.55;
        audioCtx.createMediaStreamSource(s).connect(analyser);
        barras = Array.prototype.slice.call(onda.children);
        linhaGrav.classList.add('ao-vivo');
        desenharOnda();
      } catch (x) { /* sem Web Audio: onda decorativa */ }
    }
    function desligarOnda() {
      cancelAnimationFrame(rafOnda);
      rafOnda = 0;
      if (audioCtx) { try { audioCtx.close(); } catch (x) {} audioCtx = null; }
      linhaGrav.classList.remove('ao-vivo');
      barras.forEach(function (b) { b.style.height = ''; });
      barras = [];
    }

    function pararTudo() {
      if (timer) clearInterval(timer);
      timer = null;
      desligarOnda();
      if (vozCtx) { try { vozCtx.close(); } catch (x) {} vozCtx = null; }
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
        rec = new MediaRecorder(prepararVoz(s), opts); // no chat secreto, grava já com a voz disfarçada
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
        ligarOnda(s);
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
        cancelAnimationFrame(rafOnda); // congela a onda no lugar
      } else if (rec.state === 'paused' && rec.resume) {
        rec.resume();
        t0 = Date.now();
        linhaGrav.classList.remove('pausada');
        if (analyser) desenharOnda();
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
          var vi = form && form.querySelector('[data-video]');
          var temFoto = (fi && fi.files && fi.files.length) || (vi && vi.files && vi.files.length);
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

      // Mobile: SEGURAR a bolha abre o menu de ações (como WhatsApp/Instagram).
      // No desktop os botõezinhos continuam aparecendo no hover.
      (function () {
        var menu = null, alvo = null;
        function montarMenu() {
          if (menu) return;
          menu = document.createElement('div');
          menu.className = 'msg-menu';
          menu.hidden = true;
          menu.innerHTML =
            '<div class="msg-menu-fundo" data-mm-fechar></div>'
            + '<div class="msg-menu-box">'
            + '<button type="button" class="msg-menu-op" data-mm-editar>✏️ Editar</button>'
            + '<button type="button" class="msg-menu-op perigo" data-mm-apagar>🗑️ Apagar para todos</button>'
            + '<button type="button" class="msg-menu-op" data-mm-fechar>Cancelar</button>'
            + '</div>';
          document.body.appendChild(menu);
          menu.addEventListener('click', function (e) {
            var bolha = alvo;
            if (e.target.closest('[data-mm-editar]')) {
              fecharMenu();
              var ed = bolha && bolha.querySelector('[data-editar-msg]');
              if (ed) ed.click();
            } else if (e.target.closest('[data-mm-apagar]')) {
              fecharMenu();
              var ap = bolha && bolha.querySelector('[data-apagar-msg]');
              if (ap) ap.click();
            } else if (e.target.closest('[data-mm-fechar]') || e.target === menu) {
              fecharMenu();
            }
          });
        }
        function abrirMenu(bolha) {
          montarMenu();
          alvo = bolha;
          menu.querySelector('[data-mm-editar]').hidden = !bolha.querySelector('[data-editar-msg]');
          menu.hidden = false;
          try { if (navigator.vibrate) navigator.vibrate(25); } catch (x) {}
        }
        function fecharMenu() {
          if (menu) menu.hidden = true;
          if (alvo) alvo.classList.remove('segurando');
          alvo = null;
        }

        var lpTimer = 0, lpBolha = null, lpX = 0, lpY = 0, lpDisparou = false;
        function cancelarLp() {
          clearTimeout(lpTimer);
          if (lpBolha && lpBolha !== alvo) lpBolha.classList.remove('segurando');
          lpBolha = null;
        }
        msgs.addEventListener('pointerdown', function (e) {
          if (e.pointerType !== 'touch') return;
          var bolha = e.target.closest('.dm-bolha.minha');
          if (!bolha || !bolha.querySelector('[data-apagar-msg]')) return; // apagada ou sem ações
          lpBolha = bolha; lpX = e.clientX; lpY = e.clientY; lpDisparou = false;
          bolha.classList.add('segurando');
          lpTimer = setTimeout(function () { lpDisparou = true; abrirMenu(bolha); }, 480);
        });
        msgs.addEventListener('pointermove', function (e) {
          if (lpBolha && (Math.abs(e.clientX - lpX) > 12 || Math.abs(e.clientY - lpY) > 12)) cancelarLp();
        });
        msgs.addEventListener('pointerup', cancelarLp);
        msgs.addEventListener('pointercancel', cancelarLp);
        msgs.addEventListener('contextmenu', function (e) { if (lpDisparou || lpBolha) e.preventDefault(); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fecharMenu(); });
      })();

      // Apagar para todos (AJAX): a bolha vira "Mensagem apagada" na hora
      msgs.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-apagar-msg]');
        if (!btn) return;
        if (!window.confirm('Apagar esta mensagem para todos? Não dá para desfazer.')) return;
        btn.disabled = true;
        fetch('/mensagens/apagar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF, 'X-Requested-With': 'fetch' },
          body: JSON.stringify({ escopo: btn.getAttribute('data-escopo'), id: btn.getAttribute('data-id') }),
        })
          .then(function (r) { return r.ok ? r.json() : r.json().then(function (d) { throw new Error(d.erro || 'Falha'); }); })
          .then(function () {
            var bolha = btn.closest('.dm-bolha');
            var hora = bolha.querySelector('.dm-hora');
            bolha.className = bolha.className.replace(' tem-img', '');
            bolha.innerHTML = '<div class="dm-bolha-txt dm-apagada">🚫 Mensagem apagada</div>'
              + '<div class="dm-bolha-meta"><span class="dm-hora">' + (hora ? hora.textContent : '') + '</span></div>';
          })
          .catch(function (err) { btn.disabled = false; alert(err.message || 'Não foi possível apagar.'); });
      });

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
    // Preview do anexo (imagem OU vídeo escolhido/capturado)
    function mostrarPreview(form) {
      if (!form) return;
      var prev = form.querySelector('[data-preview]');
      if (!prev) return;
      prev.innerHTML = '';
      var algum = false;
      [{ sel: '[data-foto]', tag: 'img' }, { sel: '[data-video]', tag: 'video' }].forEach(function (t) {
        var input = form.querySelector(t.sel);
        var f = input && input.files && input.files[0];
        if (!f) return;
        algum = true;
        var wrap = document.createElement('div'); wrap.className = 'anexo-item';
        var el = document.createElement(t.tag);
        el.src = URL.createObjectURL(f);
        if (t.tag === 'video') { el.controls = true; el.muted = true; el.playsInline = true; }
        wrap.appendChild(el);
        var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'anexo-remover'; rm.setAttribute('aria-label', 'Remover'); rm.innerHTML = '&times;';
        rm.addEventListener('click', function () {
          input.value = '';
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        wrap.appendChild(rm);
        prev.appendChild(wrap);
      });
      prev.hidden = !algum;
    }
    document.addEventListener('change', function (e) {
      var input = e.target.closest('[data-foto], [data-video]');
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
        + '<div class="cam-rec" data-cam-rec hidden><span class="cam-rec-dot"></span><span data-cam-rec-tempo>0:00</span></div>'
        + '<div class="cam-dica">Toque para foto · segure para vídeo</div>'
        + '<div class="cam-barra"><button type="button" class="cam-shutter" data-cam-capturar aria-label="Tirar foto ou segurar para gravar vídeo"></button></div>';
      document.body.appendChild(camModal);
      camVideo = camModal.querySelector('video');
      camZoomEl = camModal.querySelector('[data-cam-zoom]');
      camModal.querySelector('[data-cam-cancelar]').addEventListener('click', fecharCamera);
      camModal.querySelector('[data-cam-flip]').addEventListener('click', virarCamera);

      // Obturador estilo WhatsApp: toque = foto, segurar = grava vídeo (solta para enviar)
      var shutter = camModal.querySelector('[data-cam-capturar]');
      var holdTimer = 0, viaPointer = false;
      shutter.addEventListener('pointerdown', function (e) {
        viaPointer = true;
        try { shutter.setPointerCapture(e.pointerId); } catch (x) {}
        holdTimer = setTimeout(iniciarVideo, 350);
      });
      shutter.addEventListener('pointerup', function () {
        clearTimeout(holdTimer);
        if (camRec) pararVideo(true);
        else capturar();
        setTimeout(function () { viaPointer = false; }, 400);
      });
      shutter.addEventListener('pointercancel', function () {
        clearTimeout(holdTimer);
        if (camRec) pararVideo(false);
      });
      shutter.addEventListener('click', function () { if (!viaPointer) capturar(); }); // teclado
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
    // ----- Gravação de vídeo (segurar o obturador) -----
    var camRec = null, camRecChunks = [], camRecTimer = 0, camRecT0 = 0, camRecEnviar = false;
    function iniciarVideo() {
      if (!window.MediaRecorder || !camStream || camRec) return; // sem suporte: soltar tira foto
      // Bitrate explícito: o padrão do navegador é baixo demais para 1080p e o vídeo sai "quadriculado".
      // 5 Mbps de vídeo × 1 min ≈ 38 MB — cabe no limite de 60 MB do upload.
      var opts = { videoBitsPerSecond: 5000000, audioBitsPerSecond: 128000 };
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) opts.mimeType = 'video/webm;codecs=vp8,opus';
      else if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('video/webm')) opts.mimeType = 'video/webm';
      else if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('video/mp4')) opts.mimeType = 'video/mp4';
      try { camRec = new MediaRecorder(camStream, opts); } catch (x) { camRec = null; return; }
      camRecChunks = []; camRecEnviar = false;
      camRec.ondataavailable = function (ev) { if (ev.data && ev.data.size) camRecChunks.push(ev.data); };
      camRec.onstop = function () {
        var base = (camRec.mimeType || 'video/webm').split(';')[0];
        camRec = null;
        clearInterval(camRecTimer);
        camModal.querySelector('[data-cam-rec]').hidden = true;
        camModal.querySelector('[data-cam-capturar]').classList.remove('gravando');
        if (!camRecEnviar || !camRecChunks.length) { camRecChunks = []; return; }
        var blob = new Blob(camRecChunks, { type: base });
        camRecChunks = [];
        try {
          var input = camForm && camForm.querySelector('[data-video]');
          if (!input) return;
          var dt = new DataTransfer();
          dt.items.add(new File([blob], base === 'video/mp4' ? 'video.mp4' : 'video.webm', { type: base }));
          input.files = dt.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (x) {}
        fecharCamera();
      };
      camRec.start(250);
      camRecT0 = Date.now();
      camModal.querySelector('[data-cam-capturar]').classList.add('gravando');
      var chip = camModal.querySelector('[data-cam-rec]');
      var tEl = camModal.querySelector('[data-cam-rec-tempo]');
      chip.hidden = false;
      tEl.textContent = '0:00';
      camRecTimer = setInterval(function () {
        var s = Math.floor((Date.now() - camRecT0) / 1000);
        tEl.textContent = Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
        if (s >= 60) pararVideo(true); // máx. 1 min
      }, 300);
    }
    function pararVideo(enviar) {
      if (!camRec || camRec.state === 'inactive') return;
      camRecEnviar = enviar;
      try { camRec.stop(); } catch (x) {}
    }

    // Abre o stream na câmera atual (camFacing), COM microfone (para o vídeo ter som);
    // se o mic for negado, segue só com a câmera. Detecta zoom nativo (hardware).
    function abrirStream() {
      pararStream();
      // Resolução ALTA é obrigatória: sem width/height o navegador entrega 640×480
      // e a foto sai borrada. "ideal" nunca rejeita — o navegador dá o máximo que a câmera tiver.
      var pedir = function (comAudio) {
        return navigator.mediaDevices.getUserMedia({
          video: { facingMode: camFacing, width: { ideal: 1920 }, height: { ideal: 1440 }, frameRate: { ideal: 30 } },
          audio: comAudio,
        });
      };
      return pedir(true).catch(function () { return pedir(false); })
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
    function fecharCamera() {
      if (camRec && camRec.state !== 'inactive') { camRecEnviar = false; try { camRec.stop(); } catch (x) {} }
      pararStream(); zPtrs = {}; zPinch0 = 0;
      document.body.classList.remove('sem-scroll');
      if (camModal) camModal.hidden = true;
    }

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
      }, 'image/jpeg', 0.92);
    }
    function captureFallback(b) {
      var input = b.form && b.form.querySelector('[data-foto]');
      if (input) { input.setAttribute('capture', 'environment'); input.click(); }
    }
    // Celular: abre a CÂMERA NATIVA do aparelho (app de câmera de verdade — HDR,
    // resolução total do sensor, foto ou vídeo). É a mesma qualidade do Instagram.
    // O arquivo volta e cai no campo certo (imagem/vídeo) do form de origem.
    function capturaNativa(form) {
      if (!form) return;
      var tmp = document.createElement('input');
      tmp.type = 'file';
      tmp.accept = 'image/png,image/jpeg,video/mp4,video/quicktime,video/webm';
      tmp.setAttribute('capture', 'environment');
      tmp.className = 'visualmente-oculto';
      document.body.appendChild(tmp);
      tmp.addEventListener('change', function () {
        var f = tmp.files && tmp.files[0];
        tmp.remove();
        if (!f) return;
        var alvo = form.querySelector(f.type.indexOf('video/') === 0 ? '[data-video]' : '[data-foto]');
        if (!alvo) return;
        try {
          var dt = new DataTransfer();
          dt.items.add(f);
          alvo.files = dt.files;
        } catch (x) { return; }
        alvo.dispatchEvent(new Event('change', { bubbles: true }));
      });
      tmp.click();
    }
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-camera]');
      if (!b) return;
      camForm = b.form;
      // Aparelho de toque (celular/tablet): câmera nativa. Desktop: webcam do navegador.
      if (window.matchMedia('(pointer: coarse)').matches) { capturaNativa(b.form); return; }
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

  /* ---------- Revelar conteúdo ----------
     Navegação dentro do app (rapido): SEM stagger e sem transform — o conteúdo aparece
     na hora com um fade curtíssimo, como trocar de aba no Instagram. O stagger bonito
     fica só para a primeira entrada da sessão (junto do loader do anjo). */
  function revelar(rapido) {
    document.documentElement.classList.remove('preparando');
    document.body.classList.add('pronto');
    if (rapido) {
      document.body.classList.add('entrada-rapida');
      // sem contarNumeros(): re-animar os contadores a cada troca de aba dava "engasgada"
      return;
    }
    var alvos = document.querySelectorAll('.container > *:not(.modal)');
    alvos.forEach(function (el, i) {
      el.style.setProperty('--d', (Math.min(i, 8) * 60) + 'ms'); // teto no atraso: nada de fila longa
      el.classList.add('reveal');
    });
    setTimeout(contarNumeros, 250);
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
