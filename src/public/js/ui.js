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
  // (Chrome/Android e iOS que ignoram user-scalable=no no viewport). O bloqueio vale
  // já no touchstart — alguns iOS só respeitam se o gesto for barrado no INÍCIO.
  function bloquearPinca(e) {
    if (e.touches.length < 2) return;
    if (e.target.closest('.lightbox, .cam-modal, .stview, .stcomp, .tw-post-midia, .cropper, #cropper')) return;
    e.preventDefault();
  }
  document.addEventListener('touchstart', bloquearPinca, { passive: false });
  document.addEventListener('touchmove', bloquearPinca, { passive: false });

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

    var comp = null, compFile = null, compEhVideo = false, compUrl = '', compMencoes = [];
    function renderMencoes() {
      if (!comp) return;
      var box = comp.querySelector('.stcomp-chips');
      if (!compMencoes.length) { box.hidden = true; box.innerHTML = ''; return; }
      box.hidden = false;
      box.innerHTML = compMencoes.map(function (m) {
        return '<span class="stcomp-chip">🏷️ @' + m.usuario
          + '<button type="button" class="stcomp-chip-x" data-tirar-mencao="' + m.id + '" aria-label="Remover marcação">&times;</button></span>';
      }).join('');
    }
    function montarComposer() {
      if (comp) return;
      comp = document.createElement('div');
      comp.className = 'stcomp';
      comp.hidden = true;
      comp.innerHTML =
        '<div class="stview-cab"><span class="stview-nome">Novo story</span>'
        + '<button type="button" class="stview-x" data-comp-fechar aria-label="Cancelar">&times;</button></div>'
        + '<div class="stcomp-media"></div>'
        + '<div class="stcomp-acoes">'
        + '  <button type="button" class="stcomp-marcar">🏷️ Marcar pessoas</button>'
        + '  <span class="stcomp-chips" hidden></span>'
        + '</div>'
        + '<button type="button" class="btn btn-primario stcomp-enviar">Compartilhar no story</button>';
      document.body.appendChild(comp);
      comp.querySelector('[data-comp-fechar]').addEventListener('click', fecharComposer);
      comp.querySelector('.stcomp-enviar').addEventListener('click', enviarStory);
      // Marcar pessoas (pode várias): cada marcada recebe no Direct o card com "Repostar"
      comp.querySelector('.stcomp-marcar').addEventListener('click', function () {
        abrirSeletorPessoa('Marcar pessoa no story', function (p) {
          if (compMencoes.some(function (m) { return m.id === p.id; })) return;
          compMencoes.push({ id: p.id, usuario: p.usuario });
          renderMencoes();
        });
      });
      comp.querySelector('.stcomp-chips').addEventListener('click', function (e) {
        var b = e.target.closest('[data-tirar-mencao]');
        if (!b) return;
        compMencoes = compMencoes.filter(function (m) { return m.id !== b.getAttribute('data-tirar-mencao'); });
        renderMencoes();
      });
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
      compMencoes = [];
      renderMencoes();
      comp.hidden = false;
      document.body.classList.add('sem-scroll');
    }
    function enviarStory() {
      if (!compFile) return;
      var form = document.getElementById('formStory');
      var btn = comp.querySelector('.stcomp-enviar');
      btn.disabled = true; btn.textContent = 'Publicando…';
      var fd = new FormData();
      var tk = (form && form.querySelector('input[name="_csrf"]')) || document.querySelector('input[name="_csrf"]');
      if (tk) fd.append('_csrf', tk.value);
      fd.append(compEhVideo ? 'video' : 'imagem', compFile, compFile.name || (compEhVideo ? 'story.mp4' : 'story.jpg'));
      if (compMencoes.length) fd.append('mencao', compMencoes.map(function (m) { return m.id; }).join(','));
      fetch('/stories', { method: 'POST', headers: { 'X-Requested-With': 'fetch', 'Accept': 'application/json', 'X-CSRF-Token': CSRF }, body: fd })
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

    // --- "Repostar esse story" (card de menção no Direct): monta a ARTE e abre o
    // COMPOSITOR — a pessoa VÊ como vai ficar antes de compartilhar. Foto vira a
    // composição com fundo dourado da marca + logo do Mendes + crédito; vídeo abre
    // direto no compositor com preview. ---
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-repostar-story]');
      if (!b || b.disabled) return;
      b.disabled = true;
      var rotulo = b.textContent;
      b.textContent = 'Preparando…';
      function liberar() { b.disabled = false; b.textContent = rotulo; }
      function falha() { liberar(); toast('Não foi possível preparar o repost.'); }

      var vid = b.getAttribute('data-rps-video');
      if (vid) {
        fetch(vid)
          .then(function (r) { return r.ok ? r.blob() : Promise.reject(); })
          .then(function (blob) {
            liberar();
            abrirComposer(new File([blob], 'repost.mp4', { type: blob.type || 'video/mp4' }), true);
          })
          .catch(falha);
        return;
      }
      var img = b.getAttribute('data-rps-img');
      if (!img) { falha(); return; }
      var autor = b.getAttribute('data-rps-autor') || '';
      var foto = new Image(), logo = new Image();
      var pend = 2, temLogo = true, morto = false;
      function pronto() {
        if (--pend > 0 || morto) return;
        try {
          var W = 1080, H = 1920;
          var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
          var ctx = cv.getContext('2d');
          var grad = ctx.createLinearGradient(0, 0, 0, H);
          grad.addColorStop(0, '#e9bb55'); grad.addColorStop(0.5, '#d4a017'); grad.addColorStop(1, '#9c750e');
          ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
          if (temLogo && logo.naturalWidth) { // logo da marca no topo
            var lw = 280, lh = logo.naturalHeight * (lw / logo.naturalWidth);
            ctx.globalAlpha = 0.95;
            ctx.drawImage(logo, (W - lw) / 2, 120, lw, lh);
            ctx.globalAlpha = 1;
          }
          // foto original emoldurada no centro, com cantos arredondados e sombra
          var maxW = W * 0.78, maxH = H * 0.56;
          var esc = Math.min(maxW / foto.naturalWidth, maxH / foto.naturalHeight);
          var fw = foto.naturalWidth * esc, fh = foto.naturalHeight * esc;
          var fx = (W - fw) / 2, fy = (H - fh) / 2 + 30, r = 36;
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 24;
          ctx.beginPath();
          ctx.moveTo(fx + r, fy);
          ctx.arcTo(fx + fw, fy, fx + fw, fy + fh, r);
          ctx.arcTo(fx + fw, fy + fh, fx, fy + fh, r);
          ctx.arcTo(fx, fy + fh, fx, fy, r);
          ctx.arcTo(fx, fy, fx + fw, fy, r);
          ctx.closePath();
          ctx.fillStyle = '#000'; ctx.fill();
          ctx.shadowColor = 'transparent';
          ctx.clip();
          ctx.drawImage(foto, fx, fy, fw, fh);
          ctx.restore();
          ctx.fillStyle = 'rgba(20,12,0,0.8)';
          ctx.font = '600 40px system-ui, -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Story de @' + autor, W / 2, fy + fh + 90);
          cv.toBlob(function (blob) {
            if (!blob) { falha(); return; }
            liberar();
            abrirComposer(new File([blob], 'repost.jpg', { type: 'image/jpeg' }), false);
          }, 'image/jpeg', 0.92);
        } catch (x) { falha(); }
      }
      foto.onload = pronto;
      foto.onerror = function () { morto = true; falha(); };
      logo.onload = pronto;
      logo.onerror = function () { temLogo = false; pronto(); }; // sem logo, segue só com o fundo
      foto.src = img;
      logo.src = '/img/logo.png';
    });

    // --- Visualizador ---
    var view = null, barras = null, mediaBox = null, avEl = null, nomeEl = null, tempoEl = null,
      vistosEl = null, delBtn = null, somBtn = null;
    var rodapeEl = null, respEl = null, enviarEl = null, likeEl = null, fwdEl = null, fwdModal = null, vistosModal = null, delModal = null, mrcModal = null, mrcPessoa = null;
    var palcoEl = null, cuboEl = null, faceEl = null, vizPrevEl = null, vizNextEl = null;
    var swipeX = null, gesto = '', cuboDir = 0, cuboW = 0;

    // Pula direto para outro grupo (clique na prévia lateral do desktop)
    function irParaGrupo(idx) {
      if (!grupos[idx]) return;
      gi = idx;
      var g = grupos[gi];
      ii = g.eu ? 0 : g.itens.findIndex(function (it) { return !it.visto; });
      if (ii < 0) ii = 0;
      mostrar();
    }

    // Prévias laterais (desktop): foto escurecida + avatar + nome + tempo do grupo vizinho
    function atualizarVizinhos() {
      [[vizPrevEl, grupos[gi - 1]], [vizNextEl, grupos[gi + 1]]].forEach(function (par) {
        var el = par[0], g = par[1];
        if (!el) return;
        if (!g) { el.hidden = true; return; }
        el.hidden = false;
        var it = g.itens[0];
        var av = g.foto_perfil ? '<img src="' + escSt(g.foto_perfil) + '" alt="">' : escSt((g.nome || '?').trim().charAt(0).toUpperCase());
        el.innerHTML = (it.imagem ? '<img class="stviz-fundo" src="' + escSt(it.imagem) + '" alt="">' : '<span class="stviz-fundo-video">🎬</span>')
          + '<span class="stviz-info"><span class="stviz-av">' + av + '</span>'
          + '<span class="stviz-nome">' + escSt(g.usuario) + '</span>'
          + '<span class="stviz-tempo">' + tempoRelJs(g.itens[g.itens.length - 1].criado_em) + '</span></span>';
      });
    }

    // Story vizinho na direção do arrasto (1 = próximo, -1 = anterior)
    function vizinhoDe(dir) {
      var g = grupos[gi];
      if (!g) return null;
      if (dir > 0) return g.itens[ii + 1] || (grupos[gi + 1] && grupos[gi + 1].itens[0]) || null;
      return g.itens[ii - 1] || (grupos[gi - 1] && grupos[gi - 1].itens[grupos[gi - 1].itens.length - 1]) || null;
    }
    // Prepara o cubo 3D: a tela vira a face frontal; o vizinho entra na face lateral
    function prepararCubo(w, dir) {
      cuboW = w; cuboDir = dir;
      cuboEl.style.transition = 'none';
      cuboEl.style.transform = 'translateZ(' + (-w / 2) + 'px)';
      mediaBox.style.transform = 'rotateY(0deg) translateZ(' + (w / 2) + 'px)';
      faceEl.style.display = 'grid'; // a face só existe durante o giro
      faceEl.style.transform = 'rotateY(' + (dir * 90) + 'deg) translateZ(' + (w / 2) + 'px)';
      faceEl.innerHTML = '';
      var viz = vizinhoDe(dir);
      if (viz && viz.imagem) {
        var im = document.createElement('img');
        im.src = viz.imagem; im.alt = '';
        faceEl.appendChild(im);
      } else if (viz && viz.video) {
        faceEl.innerHTML = '<div class="fviz-video">🎬</div>';
      }
    }
    function limparCubo() {
      cuboEl.style.transition = ''; cuboEl.style.transform = '';
      mediaBox.style.transform = '';
      faceEl.style.transform = ''; faceEl.style.display = ''; faceEl.innerHTML = '';
      cuboDir = 0; cuboW = 0; gesto = '';
    }
    var grupos = [], gi = 0, ii = 0;
    var raf = 0, t0 = 0, decorrido = 0, dur = 5000, pausado = false, videoEl = null;
    var pressT = 0, swipeY = -1, mostrarSeq = 0;

    // Folha "Visualizações" (só no MEU story): quem viu, com coração ao lado de quem curtiu.
    var CORACAO_MINI = '<svg class="visto-coracao" viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-label="Curtiu"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
    function abrirVistos() {
      var item = grupos[gi] && grupos[gi].itens[ii];
      if (!item || !(grupos[gi] && grupos[gi].eu)) return;
      pausar(true);
      if (!vistosModal) {
        vistosModal = document.createElement('div');
        vistosModal.className = 'modal sheet-share stview-fwd-modal';
        vistosModal.hidden = true;
        vistosModal.setAttribute('aria-hidden', 'true');
        vistosModal.innerHTML = '<div class="modal-card share-card">'
          + '<div class="sheet-cab sempre"><span class="sheet-grab" aria-hidden="true"></span>'
          + '<span class="sheet-titulo">Visualizações</span>'
          + '<button type="button" class="sheet-x" data-fechar-modal aria-label="Fechar">&times;</button></div>'
          + '<div class="share-lista vistos-lista"></div></div>';
        document.body.appendChild(vistosModal);
        vistosModal.addEventListener('click', function (e) {
          if (e.target.closest('[data-fechar-modal]') || e.target === vistosModal) pausar(false);
        });
      }
      var lista = vistosModal.querySelector('.vistos-lista');
      lista.innerHTML = '<div class="texto-suave" style="padding:10px 6px;">Carregando…</div>';
      vistosModal.hidden = false; vistosModal.setAttribute('aria-hidden', 'false');
      fetch('/stories/' + item.id_story + '/vistos', { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function (pessoas) {
          if (!pessoas.length) { lista.innerHTML = '<div class="texto-suave" style="padding:10px 6px;">Ninguém viu ainda.</div>'; return; }
          var curtidas = pessoas.filter(function (p) { return p.curtiu; }).length;
          lista.innerHTML = '<div class="vistos-resumo">👁 ' + pessoas.length + (pessoas.length === 1 ? ' visualização' : ' visualizações')
            + (curtidas ? ' · ❤ ' + curtidas + (curtidas === 1 ? ' curtida' : ' curtidas') : '') + '</div>'
            + pessoas.map(function (p) {
            var av = p.foto_perfil ? '<img src="' + escSt(p.foto_perfil) + '" alt="">' : escSt((p.nome || '?').trim().charAt(0).toUpperCase());
            return '<a class="share-item" href="/u/' + encodeURIComponent(p.usuario) + '">'
              + '<span class="share-av">' + av + '</span>'
              + '<span class="share-txt"><span class="share-nome">' + escSt(p.nome) + '</span>'
              + '<span class="share-user">@' + escSt(p.usuario) + '</span></span>'
              + (p.curtiu ? CORACAO_MINI : '')
              + '</a>';
          }).join('');
        })
        .catch(function () { lista.innerHTML = '<div class="texto-suave" style="padding:10px 6px;">Não foi possível carregar.</div>'; });
    }

    // Folha "Encaminhar no Direct": lista a equipe; tocar numa pessoa envia o story.
    function abrirEncaminhar() {
      var item = grupos[gi] && grupos[gi].itens[ii];
      if (!item) return;
      pausar(true);
      if (!fwdModal) {
        fwdModal = document.createElement('div');
        fwdModal.className = 'modal sheet-share stview-fwd-modal';
        fwdModal.hidden = true;
        fwdModal.setAttribute('aria-hidden', 'true');
        fwdModal.innerHTML = '<div class="modal-card share-card">'
          + '<div class="sheet-cab sempre"><span class="sheet-grab" aria-hidden="true"></span>'
          + '<span class="sheet-titulo">Enviar para</span>'
          + '<button type="button" class="sheet-x" data-fechar-modal aria-label="Fechar">&times;</button></div>'
          + '<div class="share-lista fwd-lista"></div></div>';
        document.body.appendChild(fwdModal);
        fwdModal.addEventListener('click', function (e) {
          if (e.target.closest('[data-fechar-modal]') || e.target === fwdModal) { pausar(false); return; }
          var b = e.target.closest('[data-fwd-para]');
          if (!b) return;
          b.disabled = true;
          fetch('/stories/' + (grupos[gi] && grupos[gi].itens[ii] || {}).id_story + '/encaminhar', {
            method: 'POST',
            headers: { 'X-CSRF-Token': CSRF, 'X-Requested-With': 'fetch', 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ para: b.getAttribute('data-fwd-para') }),
          })
            .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
            .then(function () {
              toast('Enviado no Direct ✈️');
              fwdModal.setAttribute('hidden', ''); fwdModal.setAttribute('aria-hidden', 'true');
              pausar(false);
            })
            .catch(function () { toast('Não foi possível enviar.'); })
            .finally(function () { b.disabled = false; });
        });
      }
      var lista = fwdModal.querySelector('.fwd-lista');
      lista.innerHTML = '<div class="texto-suave" style="padding:10px 6px;">Carregando…</div>';
      fwdModal.hidden = false; fwdModal.setAttribute('aria-hidden', 'false');
      fetch('/buscar?q=', { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function (pessoas) {
          if (!pessoas.length) { lista.innerHTML = '<div class="texto-suave" style="padding:10px 6px;">Ninguém disponível.</div>'; return; }
          lista.innerHTML = pessoas.map(function (p) {
            var av = p.foto_perfil ? '<img src="' + escSt(p.foto_perfil) + '" alt="">' : escSt((p.nome || '?').trim().charAt(0).toUpperCase());
            return '<button type="button" class="share-item" data-fwd-para="' + escSt(String(p.id_usuario || '')) + '">'
              + '<span class="share-av">' + av + '</span>'
              + '<span class="share-txt"><span class="share-nome">' + escSt(p.nome) + '</span>'
              + '<span class="share-user">@' + escSt(p.usuario) + '</span></span></button>';
          }).join('');
        })
        .catch(function () { lista.innerHTML = '<div class="texto-suave" style="padding:10px 6px;">Não foi possível carregar.</div>'; });
    }

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
        '<button type="button" class="stview-viz prev" hidden aria-label="Story anterior"></button>'
        + '<div class="stview-centro">'
        + '<div class="stview-quadro">'
        + '<div class="stview-progresso"></div>'
        + '<div class="stview-cab">'
        + '  <span class="stview-av"></span>'
        + '  <span class="stview-nome"></span><span class="stview-tempo"></span>'
        + '  <span class="stview-esp" aria-hidden="true"></span>'
        + '  <button type="button" class="stview-som" hidden aria-label="Som">🔊</button>'
        + '  <button type="button" class="stview-x" aria-label="Fechar">&times;</button>'
        + '</div>'
        + '<div class="stview-palco"><div class="stview-cubo"><div class="stview-media"></div><div class="stview-face" aria-hidden="true"></div></div></div>'
        + '<div class="stview-tap prev" aria-hidden="true"></div>'
        + '<div class="stview-tap next" aria-hidden="true"></div>'
        + '<button type="button" class="stview-vistos" hidden></button>'
        + '<button type="button" class="stview-del" hidden title="Apagar story" aria-label="Apagar story">'
        + '  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
        + '</button>'
        + '<button type="button" class="stview-marcar" hidden title="Marcar pessoa neste story" aria-label="Marcar pessoa">@</button>'
        + '<div class="stview-rodape" hidden>'
        + '  <input class="stview-resp" type="text" placeholder="Responder…" maxlength="500" autocomplete="off">'
        + '  <button type="button" class="stview-enviar" hidden>Enviar</button>'
        + '  <button type="button" class="stview-like" aria-label="Curtir">'
        + '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>'
        + '  </button>'
        + '  <button type="button" class="stview-fwd" aria-label="Encaminhar no Direct">'
        + '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'
        + '  </button>'
        + '</div>'
        + '</div>'
        + '<button type="button" class="stview-seta prev" aria-label="Anterior"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>'
        + '<button type="button" class="stview-seta next" aria-label="Próximo"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>'
        + '</div>'
        + '<button type="button" class="stview-viz next" hidden aria-label="Próximo story"></button>';
      document.body.appendChild(view);
      barras = view.querySelector('.stview-progresso');
      mediaBox = view.querySelector('.stview-media');
      palcoEl = view.querySelector('.stview-palco');
      cuboEl = view.querySelector('.stview-cubo');
      faceEl = view.querySelector('.stview-face');
      vizPrevEl = view.querySelector('.stview-viz.prev');
      vizNextEl = view.querySelector('.stview-viz.next');

      // Desktop: prévias dos vizinhos clicáveis + setinhas de navegação (como o IG web)
      vizPrevEl.addEventListener('click', function () { irParaGrupo(gi - 1); });
      vizNextEl.addEventListener('click', function () { irParaGrupo(gi + 1); });
      view.querySelector('.stview-seta.prev').addEventListener('click', anterior);
      view.querySelector('.stview-seta.next').addEventListener('click', proximo);
      avEl = view.querySelector('.stview-av');
      nomeEl = view.querySelector('.stview-nome');
      tempoEl = view.querySelector('.stview-tempo');
      vistosEl = view.querySelector('.stview-vistos');
      delBtn = view.querySelector('.stview-del');
      somBtn = view.querySelector('.stview-som');

      view.querySelector('.stview-x').addEventListener('click', fecharView);

      // --- Responder / curtir / encaminhar (nos stories dos outros) ---
      rodapeEl = view.querySelector('.stview-rodape');
      respEl = view.querySelector('.stview-resp');
      enviarEl = view.querySelector('.stview-enviar');
      likeEl = view.querySelector('.stview-like');
      fwdEl = view.querySelector('.stview-fwd');

      // Teclado do celular: a barra sobe junto (visualViewport) — nada fica escondido
      function ajustarTeclado() {
        if (!window.visualViewport || !rodapeEl) return;
        var vv = window.visualViewport;
        var dif = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        rodapeEl.style.transform = dif ? 'translateY(-' + dif + 'px)' : '';
      }
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', ajustarTeclado);
        window.visualViewport.addEventListener('scroll', ajustarTeclado);
      }

      function enviarResposta() {
        var item = grupos[gi] && grupos[gi].itens[ii];
        var texto = respEl.value.trim();
        if (!item || !texto) return;
        respEl.disabled = true; enviarEl.disabled = true;
        fetch('/stories/' + item.id_story + '/responder', {
          method: 'POST',
          headers: { 'X-CSRF-Token': CSRF, 'X-Requested-With': 'fetch', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ texto: texto }),
        })
          .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
          .then(function () { respEl.value = ''; atualizarBarraResp(); toast('Resposta enviada 💬'); respEl.blur(); })
          .catch(function () { toast('Não foi possível responder.'); })
          .finally(function () { respEl.disabled = false; enviarEl.disabled = false; });
      }
      // Digitando: aparece o "Enviar", somem coração/avião e o fundo escurece (como no IG)
      function atualizarBarraResp() {
        var tem = !!respEl.value.trim();
        enviarEl.hidden = !tem;
        likeEl.hidden = tem;
        fwdEl.hidden = tem;
      }
      respEl.addEventListener('input', atualizarBarraResp);
      respEl.addEventListener('focus', function () {
        pausar(true);
        view.classList.add('respondendo');
        setTimeout(ajustarTeclado, 80); // o teclado leva um instante para abrir
      });
      respEl.addEventListener('blur', function () {
        view.classList.remove('respondendo');
        rodapeEl.style.transform = '';
        atualizarBarraResp();
        if (!view.hidden) pausar(false);
      });
      respEl.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        enviarResposta();
      });
      enviarEl.addEventListener('pointerdown', function (e) { e.preventDefault(); }); // não rouba o foco do input
      enviarEl.addEventListener('click', enviarResposta);

      // "👁 N · ❤ M" (no seu story) abre a lista de quem viu, coração ao lado de quem curtiu
      vistosEl.addEventListener('click', abrirVistos);

      // "@" no MEU story: marcar alguém mesmo depois de postar — com CARDZINHO de
      // confirmação antes de enviar (a pessoa recebe o card no Direct e pode repostar)
      view.querySelector('.stview-marcar').addEventListener('click', function () {
        var item = grupos[gi] && grupos[gi].itens[ii];
        if (!item || !(grupos[gi] && grupos[gi].eu)) return;
        pausar(true);
        abrirSeletorPessoa('Marcar pessoa no story', function (p) {
          if (!mrcModal) {
            mrcModal = document.createElement('div');
            mrcModal.className = 'modal stview-fwd-modal';
            mrcModal.hidden = true;
            mrcModal.setAttribute('aria-hidden', 'true');
            mrcModal.innerHTML = '<div class="modal-card stdel-card">'
              + '<h3 class="mrc-titulo"></h3>'
              + '<p class="texto-suave">A pessoa recebe o story no Direct e pode repostar.</p>'
              + '<div class="modal-acoes">'
              + '<button type="button" class="btn btn-secundario btn-sm" data-fechar-modal>Cancelar</button>'
              + '<button type="button" class="btn btn-primario btn-sm mrc-ok">Marcar</button>'
              + '</div></div>';
            document.body.appendChild(mrcModal);
            mrcModal.addEventListener('click', function (ev) {
              if (ev.target.closest('[data-fechar-modal]') || ev.target === mrcModal) { pausar(false); return; }
              if (!ev.target.closest('.mrc-ok') || !mrcPessoa) return;
              var alvoP = mrcPessoa; mrcPessoa = null;
              mrcModal.setAttribute('hidden', '');
              mrcModal.setAttribute('aria-hidden', 'true');
              fetch('/stories/' + alvoP.idStory + '/marcar', {
                method: 'POST',
                headers: { 'X-CSRF-Token': CSRF, 'X-Requested-With': 'fetch', 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ pessoa: alvoP.id }),
              })
                .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
                .then(function (d) { toast('Marcado! @' + (d.usuario || alvoP.usuario) + ' recebeu no Direct 🏷️'); })
                .catch(function () { toast('Não foi possível marcar.'); })
                .finally(function () { pausar(false); });
            });
          }
          mrcPessoa = { id: p.id, usuario: p.usuario, idStory: item.id_story };
          mrcModal.querySelector('.mrc-titulo').textContent = 'Marcar @' + p.usuario + ' neste story?';
          mrcModal.hidden = false;
          mrcModal.setAttribute('aria-hidden', 'false');
        }, function () { pausar(false); });
      });

      likeEl.addEventListener('click', function () {
        var item = grupos[gi] && grupos[gi].itens[ii];
        if (!item) return;
        item.curti = !item.curti; // otimista, como no Instagram
        likeEl.classList.toggle('ativo', !!item.curti);
        fetch('/stories/' + item.id_story + '/curtir', { method: 'POST', headers: { 'X-CSRF-Token': CSRF, 'X-Requested-With': 'fetch' } })
          .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
          .then(function (d) { item.curti = !!d.curti; likeEl.classList.toggle('ativo', item.curti); })
          .catch(function () {});
      });

      fwdEl.addEventListener('click', abrirEncaminhar);
      somBtn.addEventListener('click', function () {
        if (!videoEl) return;
        videoEl.muted = !videoEl.muted;
        somBtn.textContent = videoEl.muted ? '🔇' : '🔊';
      });
      // Lixeira → cardzinho de confirmação (pausa o story enquanto decide)
      delBtn.addEventListener('click', function () {
        if (!(grupos[gi] && grupos[gi].itens[ii])) return;
        pausar(true);
        if (!delModal) {
          delModal = document.createElement('div');
          delModal.className = 'modal stview-fwd-modal';
          delModal.hidden = true;
          delModal.setAttribute('aria-hidden', 'true');
          delModal.innerHTML = '<div class="modal-card stdel-card">'
            + '<h3>Apagar este story?</h3>'
            + '<p class="texto-suave">Ele some para todo mundo agora.</p>'
            + '<div class="modal-acoes">'
            + '<button type="button" class="btn btn-secundario btn-sm" data-fechar-modal>Cancelar</button>'
            + '<button type="button" class="btn btn-sm stdel-confirma">Apagar</button>'
            + '</div></div>';
          document.body.appendChild(delModal);
          delModal.addEventListener('click', function (e) {
            if (e.target.closest('[data-fechar-modal]') || e.target === delModal) { pausar(false); return; }
            if (!e.target.closest('.stdel-confirma')) return;
            var item = grupos[gi] && grupos[gi].itens[ii];
            if (!item) return;
            fetch('/stories/' + item.id_story + '/remover', { method: 'POST', headers: { 'X-CSRF-Token': CSRF, 'X-Requested-With': 'fetch' } })
              .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
              .then(function () { window.location.reload(); })
              .catch(function () { toast('Não foi possível apagar.'); });
          });
        }
        delModal.hidden = false;
        delModal.setAttribute('aria-hidden', 'false');
      });

      // Toque: soltar rápido = navega; segurar = pausa. Arrastar: a MÍDIA acompanha o
      // dedo (como virar página no Instagram) — pro lado troca de story, pra baixo fecha.
      ['prev', 'next'].forEach(function (lado) {
        var zona = view.querySelector('.stview-tap.' + lado);
        zona.addEventListener('pointerdown', function (e) {
          if (view.classList.contains('respondendo')) return; // digitando: toque só fecha o teclado
          try { zona.setPointerCapture(e.pointerId); } catch (x) {}
          pressT = Date.now(); swipeY = e.clientY; swipeX = e.clientX;
          mediaBox.style.transition = 'none';
          pausar(true);
        });
        zona.addEventListener('pointermove', function (e) {
          if (swipeX === null || view.classList.contains('respondendo')) return;
          var dx = e.clientX - swipeX, dy = e.clientY - swipeY;
          // define o eixo do gesto no primeiro movimento firme e mantém até soltar
          if (!gesto && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) gesto = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
          if (gesto === 'h') {
            // CUBO 3D girando com o dedo (efeito do Instagram): o vizinho já aparece na lateral
            var w = palcoEl.clientWidth || window.innerWidth;
            var dir = dx < 0 ? 1 : -1;
            if (cuboDir !== dir) prepararCubo(w, dir);
            var ang = Math.max(-88, Math.min(88, dx / w * 90));
            cuboEl.style.transform = 'translateZ(' + (-w / 2) + 'px) rotateY(' + ang + 'deg)';
          } else if (gesto === 'v' && dy > 0) {
            cuboEl.style.transform = 'translateY(' + dy + 'px) scale(' + Math.max(0.85, 1 - dy / 1400) + ')';
          }
        });
        function soltarArrasto(e, cancelado) {
          if (swipeX === null) return;
          var segurou = Date.now() - pressT > 260;
          var dy = e ? e.clientY - swipeY : 0;
          var dx = e ? e.clientX - swipeX : 0;
          var eixo = gesto;
          swipeY = -1; swipeX = null;
          function encaixar() { // volta pro lugar com mola
            cuboEl.style.transition = 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)';
            cuboEl.style.transform = cuboW ? 'translateZ(' + (-cuboW / 2) + 'px) rotateY(0deg)' : '';
            setTimeout(limparCubo, 240);
          }
          if (cancelado) { encaixar(); pausar(false); return; }
          if (eixo === 'v') {
            if (dy > 80) { limparCubo(); fecharView(); return; }
            encaixar(); pausar(false); return;
          }
          if (eixo === 'h') {
            var w = cuboW || palcoEl.clientWidth || window.innerWidth;
            if (Math.abs(dx) > Math.min(70, w * 0.18)) {
              // completa o giro do cubo e só então troca o story
              var dir = dx < 0 ? 1 : -1;
              var temViz = !!vizinhoDe(dir);
              cuboEl.style.transition = 'transform 0.22s ease-out';
              cuboEl.style.transform = 'translateZ(' + (-w / 2) + 'px) rotateY(' + (dir * -90) + 'deg)';
              setTimeout(function () {
                limparCubo();
                pausar(false);
                if (!temViz && dir > 0) { fecharView(); return; } // acabou tudo: fecha
                if (dir > 0) proximo(); else anterior();
              }, 225);
              return;
            }
            encaixar(); pausar(false); return;
          }
          // toque simples (sem gesto): navega
          limparCubo();
          pausar(false);
          if (!segurou && Math.abs(dx) < 8 && Math.abs(dy) < 8) (lado === 'prev' ? anterior() : proximo());
        }
        zona.addEventListener('pointerup', function (e) {
          if (view.classList.contains('respondendo')) { respEl.blur(); swipeY = -1; swipeX = null; return; }
          soltarArrasto(e, false);
        });
        zona.addEventListener('pointercancel', function () { soltarArrasto(null, true); });
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
      delBtn.hidden = !g.eu;
      view.querySelector('.stview-marcar').hidden = !g.eu;
      vistosEl.hidden = !g.eu;
      if (g.eu) {
        // "Atividade" com o ícone de pessoas, como no Instagram (detalhes na folha)
        vistosEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
          + '<span>Atividade</span>';
      }
      somBtn.hidden = !item.video;
      // Rodapé de interação (só nos stories dos outros): responder, curtir, encaminhar
      rodapeEl.hidden = !!g.eu;
      if (!g.eu) {
        respEl.placeholder = 'Responder a ' + g.usuario + '…';
        respEl.value = '';
        likeEl.classList.toggle('ativo', !!item.curti);
      }

      mediaBox.innerHTML = '';
      mediaBox.classList.remove('st-anim'); // a animação de entrada só roda quando a mídia está pronta
      mediaBox.style.transform = ''; mediaBox.style.opacity = ''; mediaBox.style.transition = '';
      var seq = ++mostrarSeq;
      view.classList.add('carregando');
      if (item.video) {
        videoEl = document.createElement('video');
        videoEl.src = item.video; videoEl.playsInline = true; videoEl.autoplay = true;
        videoEl.addEventListener('loadedmetadata', function () { dur = Math.max(1000, (videoEl.duration || 10) * 1000); });
        videoEl.addEventListener('playing', function () {
          if (seq !== mostrarSeq) return;
          view.classList.remove('carregando');
          mediaBox.classList.remove('st-anim'); void mediaBox.offsetWidth; mediaBox.classList.add('st-anim');
        });
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
          mediaBox.classList.remove('st-anim'); void mediaBox.offsetWidth; mediaBox.classList.add('st-anim');
          decorrido = 0; t0 = performance.now();
          raf = requestAnimationFrame(tick);
        };
        if (img.decode) img.decode().then(iniciar).catch(iniciar);
        else if (img.complete) iniciar();
        else { img.onload = iniciar; img.onerror = iniciar; }
      }
      preCarregar(); // próximo story baixa em segundo plano (transição instantânea)
      atualizarVizinhos(); // prévias laterais do desktop

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
        // anéis na lista do Direct e nas notas
        document.querySelectorAll('.conv-av[data-ver-stories="' + g.id_usuario + '"], .nota-av[data-ver-stories="' + g.id_usuario + '"]').forEach(function (av) {
          if (tudo && !g.eu) { av.classList.remove('st-tem'); av.classList.add('st-visto'); }
        });
      });
    }

    function fecharView() {
      pararTempo();
      if (view) view.hidden = true;
      if (cuboEl) limparCubo();
      document.body.classList.remove('sem-scroll');
      atualizarAneis();
    }

    // Abre o visualizador num usuário (idAlvo); com idStory, cai NAQUELE story exato.
    function abrirViewer(idAlvo, idStory, aoFalhar) {
      montarView();
      fetch('/stories/dados', { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function (gs) {
          grupos = gs;
          gi = grupos.findIndex(function (g) { return g.id_usuario === idAlvo; });
          if (gi < 0) { gi = 0; if (!gs.length || (idStory && aoFalhar)) { aoFalhar ? aoFalhar() : null; return; } }
          var g = grupos[gi];
          if (!g) return;
          if (idStory) {
            ii = g.itens.findIndex(function (it) { return it.id_story === idStory; });
            if (ii < 0) { if (aoFalhar) { aoFalhar(); return; } ii = 0; }
          } else {
            // começa no primeiro não visto (como no Instagram); se viu todos, do início
            ii = g.itens.findIndex(function (it) { return !it.visto && !g.eu; });
            if (ii < 0) ii = 0;
          }
          document.body.classList.add('sem-scroll');
          view.hidden = false;
          mostrar();
        })
        .catch(function () { toast('Não foi possível abrir os stories.'); });
    }

    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ver-stories]');
      if (b) {
        e.preventDefault(); // um <a> promovido a "tem story" abre o viewer, não navega
        abrirViewer(parseInt(b.getAttribute('data-ver-stories'), 10), null, null);
        return;
      }
      // Cartão de story na DM: abre o visualizador naquele story exato
      var c = e.target.closest('[data-abrir-story]');
      if (!c) return;
      abrirViewer(
        parseInt(c.getAttribute('data-abrir-story'), 10),
        parseInt(c.getAttribute('data-story-id'), 10) || null,
        function () { toast('Esse story não está mais disponível 😅'); }
      );
    });

    document.addEventListener('keydown', function (e) {
      if (!view || view.hidden) return;
      if (e.key === 'Escape') {
        // Esc com folha aberta (encaminhar/visualizações): o modal fecha (handler genérico) e o story volta
        if ((fwdModal && !fwdModal.hidden) || (vistosModal && !vistosModal.hidden) || (delModal && !delModal.hidden)) { pausar(false); return; }
        if (document.activeElement === respEl) { respEl.blur(); return; }
        fecharView();
      } else if (e.key === 'ArrowRight' && document.activeElement !== respEl) proximo();
      else if (e.key === 'ArrowLeft' && document.activeElement !== respEl) anterior();
    });
  })();

  /* ---------- Compositor do mural: Publicar só habilita com conteúdo + textarea cresce ---------- */
  (function () {
    var form = document.querySelector('.post-compositor');
    if (!form) return;
    var ta = form.querySelector('[data-texto]');
    var btn = form.querySelector('button[type="submit"]');
    if (!ta || !btn) return;
    function temConteudo() {
      var temMidia = ['[data-foto]', '[data-video]'].some(function (s) {
        var i = form.querySelector(s);
        return i && i.files && i.files.length;
      });
      return !!(ta.value.trim() || temMidia);
    }
    function atualizar() { btn.disabled = !temConteudo(); }
    form.addEventListener('input', atualizar);
    form.addEventListener('change', atualizar);
    ta.addEventListener('input', function () { // cresce com o texto, sem barra de rolagem
      ta.style.height = 'auto';
      ta.style.height = Math.min(220, ta.scrollHeight) + 'px';
    });
    atualizar();

    // Colaboradores (post em dupla/trio, "fulano e +N"): pode escolher vários
    var btnColab = form.querySelector('[data-colab-btn]');
    var colabId = form.querySelector('[data-colab-id]');
    var colabChips = form.querySelector('[data-colab-chip]');
    if (btnColab && colabId && colabChips) {
      var colabs = [];
      var renderColabs = function () {
        colabId.value = colabs.map(function (c) { return c.id; }).join(',');
        if (!colabs.length) { colabChips.hidden = true; colabChips.innerHTML = ''; return; }
        colabChips.hidden = false;
        colabChips.innerHTML = '👥 com ' + colabs.map(function (c) {
          return '<span class="colab-chip"><strong>@' + c.usuario + '</strong>'
            + '<button type="button" class="colab-tirar" data-tirar="' + c.id + '" aria-label="Remover colaborador">&times;</button></span>';
        }).join(' ');
      };
      btnColab.addEventListener('click', function () {
        abrirSeletorPessoa('Adicionar colaborador', function (p) {
          if (colabs.some(function (c) { return c.id === p.id; })) return;
          colabs.push({ id: p.id, usuario: p.usuario });
          renderColabs();
        });
      });
      colabChips.addEventListener('click', function (e) {
        var b = e.target.closest('[data-tirar]');
        if (!b) return;
        colabs = colabs.filter(function (c) { return c.id !== b.getAttribute('data-tirar'); });
        renderColabs();
      });
    }
  })();

  /* ---------- Feed ao vivo: checa novidades a cada 25s (e ao voltar pra aba) ----------
     Post novo → pílula "novas publicações" no topo. Anel de story aparece/atualiza
     sozinho, sem F5. Nada é injetado no meio do feed — zero risco de quebrar. */
  (function () {
    var stories = document.querySelector('.stories');
    var feed = document.querySelector('.feed');
    if (!stories || !feed) return; // só na página do mural
    var maiorId = 0;
    document.querySelectorAll('.tw-post[data-id]').forEach(function (p) {
      maiorId = Math.max(maiorId, parseInt(p.getAttribute('data-id'), 10) || 0);
    });
    var aviso = null, buscando = false;

    function mostrarAviso(n) {
      if (!aviso) {
        aviso = document.createElement('button');
        aviso.type = 'button';
        aviso.className = 'feed-novas';
        aviso.addEventListener('click', function () { window.scrollTo(0, 0); window.location.reload(); });
        document.body.appendChild(aviso);
      }
      aviso.textContent = '↑ ' + (n === 1 ? '1 nova publicação' : n + ' novas publicações');
      aviso.hidden = false;
    }

    function aplicarAneis(d) {
      try {
        var mapa = {};
        (d.aneis || []).forEach(function (a) { mapa[a.id_usuario] = a; });
        // meu anel: ganhou story (aqui, em outro aparelho ou via repost) → dourado na hora
        var meu = document.querySelector('.story-ring.eu-story');
        if (meu && d.euTenho) {
          meu.classList.remove('sem'); meu.classList.add('tem');
          var meuId = meu.getAttribute('data-meu-id');
          if (meuId && meu.hasAttribute('data-add-story')) {
            meu.setAttribute('data-ver-stories', meuId);
            meu.removeAttribute('data-add-story');
          }
        }
        // anéis da equipe (só promove/atualiza; reordenação fica pro próximo load)
        document.querySelectorAll('.stories .story[data-usuario-id]').forEach(function (el) {
          var id = parseInt(el.getAttribute('data-usuario-id'), 10);
          var anel = el.querySelector('.story-ring');
          if (!id || !anel || !mapa[id]) return;
          anel.classList.remove('sem');
          anel.classList.toggle('tem', !mapa[id].tudoVisto);
          anel.classList.toggle('visto', !!mapa[id].tudoVisto);
          if (!el.hasAttribute('data-ver-stories')) el.setAttribute('data-ver-stories', id);
        });
      } catch (e) {}
    }

    function checar() {
      if (document.hidden || buscando) return;
      buscando = true;
      fetch('/feed/novidades?depois=' + maiorId, { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function (d) {
          if (d.novosPosts > 0) mostrarAviso(d.novosPosts);
          aplicarAneis(d);
        })
        .catch(function () {})
        .finally(function () { buscando = false; });
    }
    window.setInterval(checar, 25000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) checar(); });
  })();

  /* ---------- Direct ao vivo: badges de não lidas por contato, sem F5 ----------
     A cada 15s (e ao voltar pra aba) a lista consulta /mensagens/estado e atualiza:
     contagem ao lado de cada contato, nome/prévia em negrito quando há novas e a
     prévia da última mensagem. O badge global (sidebar/barra) acompanha. ---------- */
  (function () {
    var lista = document.querySelector('.direct-lista');
    if (!lista) return;

    function acharConv(href) { return lista.querySelector('.conv[href="' + href + '"]'); }
    function aplicarBadge(conv, n) {
      if (!conv) return;
      var badge = conv.querySelector('.conv-badge');
      var aberta = conv.classList.contains('ativa');
      n = aberta ? 0 : (n || 0); // conversa aberta não acusa não lida
      if (n > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'conv-badge';
          conv.appendChild(badge);
        }
        badge.textContent = n;
        conv.classList.add('tem-novas');
      } else {
        if (badge) badge.remove();
        conv.classList.remove('tem-novas');
      }
    }

    var buscando = false;
    function checarDirect() {
      if (document.hidden || buscando) return;
      buscando = true;
      fetch('/mensagens/estado', { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function (d) {
          aplicarBadge(acharConv('/mensagens/anjo'), d.anjo);
          aplicarBadge(acharConv('/mensagens/protegido'), d.protegido);
          var total = (d.anjo || 0) + (d.protegido || 0);
          lista.querySelectorAll('.conv[href^="/mensagens/u/"]').forEach(function (conv) {
            var id = (conv.getAttribute('href').match(/\/u\/(\d+)/) || [])[1];
            if (!id) return;
            aplicarBadge(conv, d.porContato[id]);
            total += conv.classList.contains('ativa') ? 0 : (d.porContato[id] || 0);
            var prev = d.previas && d.previas[id];
            var sub = conv.querySelector('.conv-sub');
            if (prev && sub) sub.textContent = (prev.minha ? 'Você: ' : '') + prev.texto;
          });
          // badge global (sidebar + barra inferior)
          document.querySelectorAll('.js-msg-badge').forEach(function (b) {
            b.textContent = total;
            b.style.display = total > 0 ? '' : 'none';
          });
        })
        .catch(function () {})
        .finally(function () { buscando = false; });
    }
    window.setInterval(checarDirect, 15000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) checarDirect(); });
  })();

  /* ---------- Avatar do perfil: TOQUE abre o story (se houver) ou amplia a foto;
     SEGURAR "espia" a foto de perfil ampliada (solta, fecha) — como no Instagram ---------- */
  (function () {
    var av = document.querySelector('[data-avatar-perfil]');
    if (!av) return;
    var peek = null, timer = 0, segurou = false;

    function abrirPeek() {
      var src = av.getAttribute('data-foto-ampla');
      if (!src) return;
      if (!peek) {
        peek = document.createElement('div');
        peek.className = 'foto-peek';
        peek.hidden = true;
        peek.innerHTML = '<button type="button" class="foto-peek-x" aria-label="Fechar">&times;</button>'
          + '<img alt="" draggable="false">';
        document.body.appendChild(peek);
        // fecha no X ou tocando no fundo escuro (a foto em si não fecha)
        peek.addEventListener('click', function (e) {
          if (e.target === peek || e.target.closest('.foto-peek-x')) fecharPeek();
        });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fecharPeek(); });
      }
      peek.querySelector('img').src = src;
      peek.hidden = false;
    }
    function fecharPeek() { if (peek) peek.hidden = true; }

    av.addEventListener('pointerdown', function () {
      segurou = false;
      clearTimeout(timer);
      timer = setTimeout(function () { segurou = true; abrirPeek(); }, 420); // fica aberta; fecha no X
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
      av.addEventListener(ev, function () { clearTimeout(timer); });
    });
    av.addEventListener('contextmenu', function (e) { e.preventDefault(); }); // segurar no celular sem menu nativo

    // Toque rápido: com story, o delegate de data-ver-stories abre o viewer;
    // sem story, amplia a foto. Depois de SEGURAR, o clique residual é engolido.
    av.addEventListener('click', function (e) {
      if (segurou) { segurou = false; e.preventDefault(); e.stopPropagation(); return; }
      if (!av.hasAttribute('data-ver-stories')) abrirPeek();
    }, true);
  })();

  /* ---------- Filas horizontais (notas, stories): arrastar com o MOUSE rola ----------
     (no toque a rolagem já é nativa; um arrasto não dispara o clique do item) */
  (function () {
    document.querySelectorAll('.notas, .stories').forEach(function (fila) {
      var ativo = false, moveu = false, x0 = 0, s0 = 0;
      // sem o "drag nativo" de link/imagem, que engolia o gesto do mouse
      fila.addEventListener('dragstart', function (e) { e.preventDefault(); });
      fila.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'mouse') return;
        ativo = true; moveu = false; x0 = e.clientX; s0 = fila.scrollLeft;
        try { fila.setPointerCapture(e.pointerId); } catch (x) {}
      });
      fila.addEventListener('pointermove', function (e) {
        if (!ativo) return;
        var dx = e.clientX - x0;
        if (Math.abs(dx) > 4) moveu = true;
        fila.scrollLeft = s0 - dx;
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
        fila.addEventListener(ev, function () { ativo = false; });
      });
      fila.addEventListener('click', function (e) {
        if (moveu) { e.preventDefault(); e.stopPropagation(); moveu = false; }
      }, true);
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

  /* ---------- Seletor de pessoa (folha genérica: colaborador do post, marcar no story)
     Com CAMPO DE PESQUISA no topo: filtra ao vivo enquanto digita. ---------- */
  var selPessoaModal = null, selPessoaCb = null, selPessoaSeq = 0, selPessoaTimer = null, selPessoaFechar = null;
  function abrirSeletorPessoa(titulo, cb, aoFechar) {
    selPessoaCb = cb;
    selPessoaFechar = aoFechar || null;
    function escSP(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
    function renderizar(pessoas, lista) {
      if (!pessoas.length) { lista.innerHTML = '<div class="texto-suave" style="padding:10px 6px;">Ninguém encontrado.</div>'; return; }
      lista.innerHTML = pessoas.map(function (p) {
        var av = p.foto_perfil ? '<img src="' + escSP(p.foto_perfil) + '" alt="">' : escSP((p.nome || '?').trim().charAt(0).toUpperCase());
        return '<button type="button" class="share-item" data-selp="' + escSP(String(p.id_usuario || '')) + '" data-selp-user="' + escSP(p.usuario) + '" data-selp-nome="' + escSP(p.nome) + '">'
          + '<span class="share-av">' + av + '</span>'
          + '<span class="share-txt"><span class="share-nome">' + escSP(p.nome) + '</span>'
          + '<span class="share-user">@' + escSP(p.usuario) + '</span></span></button>';
      }).join('');
    }
    function buscar(q, lista) {
      var minha = ++selPessoaSeq;
      fetch('/buscar?q=' + encodeURIComponent(q || ''), { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function (pessoas) { if (minha === selPessoaSeq) renderizar(pessoas, lista); })
        .catch(function () { if (minha === selPessoaSeq) lista.innerHTML = '<div class="texto-suave" style="padding:10px 6px;">Não foi possível carregar.</div>'; });
    }
    if (!selPessoaModal) {
      selPessoaModal = document.createElement('div');
      selPessoaModal.className = 'modal sheet-share stview-fwd-modal';
      selPessoaModal.hidden = true;
      selPessoaModal.setAttribute('aria-hidden', 'true');
      selPessoaModal.innerHTML = '<div class="modal-card share-card">'
        + '<div class="sheet-cab sempre"><span class="sheet-grab" aria-hidden="true"></span>'
        + '<span class="sheet-titulo"></span>'
        + '<button type="button" class="sheet-x" data-fechar-modal aria-label="Fechar">&times;</button></div>'
        + '<div class="selp-busca"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
        + '<input type="text" class="selp-input" placeholder="Pesquisar…" autocomplete="off" maxlength="60"></div>'
        + '<div class="share-lista selp-lista"></div></div>';
      document.body.appendChild(selPessoaModal);
      selPessoaModal.addEventListener('click', function (e) {
        if (e.target.closest('[data-fechar-modal]') || e.target === selPessoaModal) {
          if (selPessoaFechar) { var f = selPessoaFechar; selPessoaFechar = null; f(); }
          return;
        }
        var b = e.target.closest('[data-selp]');
        if (!b) return;
        selPessoaModal.setAttribute('hidden', '');
        selPessoaModal.setAttribute('aria-hidden', 'true');
        selPessoaFechar = null;
        if (selPessoaCb) selPessoaCb({
          id: b.getAttribute('data-selp'),
          usuario: b.getAttribute('data-selp-user'),
          nome: b.getAttribute('data-selp-nome'),
        });
      });
      // Teclado do celular: a folha sobe junto e a lista encolhe — ninguém fica escondido
      if (window.visualViewport) {
        var ajustarSelp = function () {
          if (!selPessoaModal || selPessoaModal.hidden) return;
          var card = selPessoaModal.querySelector('.modal-card');
          var vv = window.visualViewport;
          var dif = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
          card.style.transform = dif ? 'translateY(-' + dif + 'px)' : '';
          card.style.maxHeight = dif ? Math.max(220, vv.height - 32) + 'px' : '';
        };
        window.visualViewport.addEventListener('resize', ajustarSelp);
        window.visualViewport.addEventListener('scroll', ajustarSelp);
      }
      selPessoaModal.querySelector('.selp-input').addEventListener('input', function () {
        var inp = this;
        clearTimeout(selPessoaTimer);
        selPessoaTimer = setTimeout(function () {
          buscar(inp.value.trim(), selPessoaModal.querySelector('.selp-lista'));
        }, 200);
      });
    }
    selPessoaModal.querySelector('.sheet-titulo').textContent = titulo;
    var cardSel = selPessoaModal.querySelector('.modal-card');
    cardSel.style.transform = ''; cardSel.style.maxHeight = '';
    var inp = selPessoaModal.querySelector('.selp-input');
    inp.value = '';
    var lista = selPessoaModal.querySelector('.selp-lista');
    lista.innerHTML = '<div class="texto-suave" style="padding:10px 6px;">Carregando…</div>';
    selPessoaModal.hidden = false;
    selPessoaModal.setAttribute('aria-hidden', 'false');
    buscar('', lista);
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
  // Confirmação bonita (substitui o confirm nativo do navegador): um cardzinho com
  // Cancelar/Confirmar. Ações destrutivas (apagar/remover/…) ganham botão vermelho.
  (function () {
    var confModal = null, confForm = null;
    document.addEventListener('submit', function (e) {
      var f = e.target.closest('[data-confirmar]');
      if (!f) return;
      if (f.dataset.confirmado === '1') { f.dataset.confirmado = ''; return; } // já passou pelo card
      e.preventDefault();
      confForm = f;
      if (!confModal) {
        confModal = document.createElement('div');
        confModal.className = 'modal';
        confModal.hidden = true;
        confModal.setAttribute('aria-hidden', 'true');
        confModal.innerHTML = '<div class="modal-card conf-card">'
          + '<h3 class="conf-titulo"></h3>'
          + '<p class="texto-suave conf-sub">Essa ação não pode ser desfeita.</p>'
          + '<div class="modal-acoes">'
          + '<button type="button" class="btn btn-secundario btn-sm" data-fechar-modal>Cancelar</button>'
          + '<button type="button" class="btn btn-primario btn-sm conf-ok">Confirmar</button>'
          + '</div></div>';
        document.body.appendChild(confModal);
        confModal.addEventListener('click', function (ev) {
          if (!ev.target.closest('.conf-ok')) return;
          confModal.setAttribute('hidden', '');
          confModal.setAttribute('aria-hidden', 'true');
          if (confForm) {
            confForm.dataset.confirmado = '1';
            if (confForm.requestSubmit) confForm.requestSubmit(); else confForm.submit();
          }
        });
      }
      var msg = f.getAttribute('data-confirmar') || 'Confirmar?';
      confModal.querySelector('.conf-titulo').textContent = msg;
      var ok = confModal.querySelector('.conf-ok');
      var destrutivo = /apagar|remover|excluir|recusar|inativar|encerrar/i.test(msg);
      ok.classList.toggle('conf-perigo', destrutivo);
      ok.textContent = destrutivo ? 'Sim, remover' : 'Confirmar';
      if (/encerrar/i.test(msg)) ok.textContent = 'Sim, encerrar';
      confModal.hidden = false;
      confModal.setAttribute('aria-hidden', 'false');
    });
  })();

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
          // contador ao lado do coração (abreviado; zero some)
          var contCor = b.querySelector('.post-curtidas');
          var nTot = Number(d.total) || 0;
          if (contCor) {
            contCor.textContent = !nTot ? ''
              : nTot < 1000 ? String(nTot)
              : ((nTot / 1000) % 1 === 0 || nTot >= 10000 ? Math.round(nTot / 1000) : (nTot / 1000).toFixed(1).replace('.', ',')) + ' mil';
          }
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

    // ----- Filtro de voz (todos os chats; padrão Grave no canal do protegido) -----
    var filtroBox = form.querySelector('[data-filtro-voz]');
    var vozSel = 'normal';
    if (filtroBox) {
      var selIni = filtroBox.querySelector('.dm-filtro-op.sel');
      if (selIni) vozSel = selIni.getAttribute('data-voz') || 'normal';
      filtroBox.addEventListener('click', function (e) {
        var b = e.target.closest('[data-voz]');
        if (!b) return;
        vozSel = b.getAttribute('data-voz');
        filtroBox.querySelectorAll('.dm-filtro-op').forEach(function (o) { o.classList.toggle('sel', o === b); });
      });
    }
    function vozAtiva() { return filtroBox && vozSel !== 'normal' ? vozSel : null; }

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

    // ----- Conversão UNIVERSAL: todo áudio vira WAV antes de enviar -----
    // Por quê: Chrome/Android gravam .webm, e o iPhone NÃO TOCA WebM — os áudios
    // ficavam mudos entre aparelhos. Decodificamos no aparelho de quem envia
    // (que sempre entende o próprio formato), aplicamos o disfarce de voz AQUI
    // (offline — funciona até no HTTP da rede interna) e regravamos em WAV,
    // que toca em iPhone, Android e PC.
    function wavBytes(bufer) {
      var canal = bufer.getChannelData(0);
      var n = canal.length, taxa = bufer.sampleRate;
      var b = new ArrayBuffer(44 + n * 2);
      var v = new DataView(b);
      function txt(off, s) { for (var i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); }
      txt(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); txt(8, 'WAVE');
      txt(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, taxa, true); v.setUint32(28, taxa * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
      txt(36, 'data'); v.setUint32(40, n * 2, true);
      for (var i2 = 0; i2 < n; i2++) {
        var s2 = Math.max(-1, Math.min(1, canal[i2]));
        v.setInt16(44 + i2 * 2, s2 < 0 ? s2 * 0x8000 : s2 * 0x7fff, true);
      }
      return b;
    }
    function paraWavProcessado(blob, cb) {
      var AC = window.AudioContext || window.webkitAudioContext;
      var OF = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!AC || !OF || !blob.arrayBuffer) { cb(null); return; }
      blob.arrayBuffer().then(function (bruto) {
        var ctx = new AC();
        return ctx.decodeAudioData(bruto).then(function (dec) {
          try { ctx.close(); } catch (e) {}
          var taxa = 24000;
          var efeito = vozAtiva();
          var off = new OF(1, Math.ceil(dec.duration * taxa) + taxa, taxa); // 1s de folga p/ cauda
          var src = off.createBufferSource(); src.buffer = dec;
          if (efeito === 'robo') {
            var osc = off.createOscillator(); osc.frequency.value = 45; osc.start();
            var anel = off.createGain(); anel.gain.value = 0;
            osc.connect(anel.gain);
            var bp = off.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.5;
            src.connect(anel); anel.connect(bp); bp.connect(off.destination);
          } else if (efeito) {
            var p = criarPitch(off, efeito === 'grave' ? 0.74 : 1.34);
            src.connect(p.entrada); p.saida.connect(off.destination);
          } else {
            src.connect(off.destination);
          }
          src.start(0);
          return off.startRendering().then(function (rend) {
            cb(new Blob([wavBytes(rend)], { type: 'audio/wav' }));
          });
        });
      }).catch(function () { cb(null); }); // não decodificou: envia como veio
    }
    // Coloca o áudio final no campo e envia.
    function enviarAudio(blob, tipoOriginal, extOriginal) {
      paraWavProcessado(blob, function (wav) {
        try {
          var f = wav ? new File([wav], 'voz.wav', { type: 'audio/wav' })
            : new File([blob], 'voz' + extOriginal, { type: tipoOriginal });
          var dt = new DataTransfer();
          dt.items.add(f);
          inputAudio.files = dt.files;
          form.submit();
        } catch (x) { toast('Não foi possível preparar o áudio.'); }
      });
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
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
      linhaGrav.classList.remove('pausada');
    }
    function mostrarGravando(mostra) {
      linhaNormal.hidden = mostra; linhaGrav.hidden = !mostra;
      linhaGrav.classList.remove('pausada');
      esconderOuvir(); // qualquer transição encerra a prévia
    }

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
        rec = new MediaRecorder(s, opts); // grava cru; o disfarce/conversão acontece no envio
        var base = (rec.mimeType || 'audio/webm').split(';')[0];
        rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) pedacos.push(ev.data); };
        rec.onstop = function () {
          pararTudo();
          mostrarGravando(false);
          if (!enviarAoParar || !pedacos.length) { pedacos = []; return; }
          var blob = new Blob(pedacos, { type: base });
          var ext = base === 'audio/mp4' ? '.m4a' : base === 'audio/ogg' ? '.ogg' : '.webm';
          enviarAudio(blob, base, ext); // → WAV universal (+ efeito de voz, se escolhido)
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
    // ----- Prévia na pausa: ouvir o que já foi gravado antes de enviar -----
    var btnOuvir = form.querySelector('[data-grav-ouvir]');
    var prevAudio = null, prevUrl = '';
    function pararPrevia() {
      if (prevAudio) { try { prevAudio.pause(); } catch (e) {} prevAudio = null; }
      if (prevUrl) { URL.revokeObjectURL(prevUrl); prevUrl = ''; }
      if (btnOuvir) btnOuvir.classList.remove('tocando');
    }
    function esconderOuvir() { pararPrevia(); if (btnOuvir) btnOuvir.hidden = true; }
    if (btnOuvir) btnOuvir.addEventListener('click', function () {
      if (prevAudio) { pararPrevia(); return; } // tocando → para
      if (!rec || rec.state !== 'paused') return;
      try { rec.requestData(); } catch (e) {} // garante o último pedacinho gravado
      setTimeout(function () {
        if (!pedacos.length) return;
        var base = (rec && rec.mimeType ? rec.mimeType : 'audio/webm').split(';')[0];
        var bruto = new Blob(pedacos, { type: base });
        // A prévia passa pelo MESMO processamento do envio: você ouve a voz já
        // disfarçada (se um efeito estiver selecionado), igualzinho ao que chega lá.
        paraWavProcessado(bruto, function (wav) {
          if (prevAudio || !rec || rec.state !== 'paused') return; // mudou de ideia no meio
          prevUrl = URL.createObjectURL(wav || bruto);
          prevAudio = new Audio(prevUrl);
          prevAudio.onended = pararPrevia;
          btnOuvir.classList.add('tocando');
          prevAudio.play().catch(pararPrevia);
        });
      }, 80);
    });

    // Pausar/retomar (como no WhatsApp): a onda congela, o tempo para e dá pra OUVIR a prévia
    var btnPausa = form.querySelector('[data-grav-pausa]');
    if (btnPausa) btnPausa.addEventListener('click', function () {
      if (!rec) return;
      if (rec.state === 'recording' && rec.pause) {
        rec.pause();
        decorrido += Date.now() - t0;
        linhaGrav.classList.add('pausada');
        cancelAnimationFrame(rafOnda); // congela a onda no lugar
        if (btnOuvir) btnOuvir.hidden = false; // pausou: pode ouvir o que já gravou
      } else if (rec.state === 'paused' && rec.resume) {
        esconderOuvir(); // retomou: para a prévia e esconde o botão
        rec.resume();
        t0 = Date.now();
        linhaGrav.classList.remove('pausada');
        if (analyser) desenharOnda();
      }
    });
    // Fallback sem getUserMedia (HTTP na rede interna): o gravador do SISTEMA entrega o
    // arquivo — que também passa pela conversão universal + efeito de voz antes de ir.
    inputAudio.addEventListener('change', function () {
      var f = inputAudio.files && inputAudio.files[0];
      if (!f) return;
      var jaUniversal = /audio\/(mp4|x-m4a|aac|mpeg|wav|x-wav)/.test(f.type);
      if (jaUniversal && !vozAtiva()) { form.submit(); return; } // já toca em tudo e sem efeito: vai direto
      var ext = f.name && f.name.lastIndexOf('.') > 0 ? f.name.slice(f.name.lastIndexOf('.')) : '.webm';
      enviarAudio(f, f.type || 'audio/webm', ext);
    });
  })();

  /* ---------- Player das mensagens de voz (arrastar busca, velocidade 1x/1,5x/2x) ---------- */
  (function () {
    function fmt(s) { var m = Math.floor(s / 60), ss = Math.floor(s % 60); return m + ':' + (ss < 10 ? '0' : '') + ss; }
    document.querySelectorAll('.dm-audio').forEach(function (box) {
      var au = box.querySelector('audio');
      var prog = box.querySelector('.dm-audio-prog');
      var tempo = box.querySelector('[data-audio-tempo]');
      var trilha = box.querySelector('.dm-audio-trilha');
      var vel = box.querySelector('[data-audio-vel]');
      function dur() { return isFinite(au.duration) && au.duration > 0 ? au.duration : 0; }
      function mostrarDur() { if (dur()) tempo.textContent = fmt(dur()); }

      // Onda de voz REAL (como no WhatsApp): decodifica o arquivo e desenha os picos.
      // Se não der (arquivo grande/formato exótico), fica a linha de sempre.
      (function () {
        var AC = window.AudioContext || window.webkitAudioContext;
        var src = au.getAttribute('src');
        if (!AC || !window.fetch || !src) return;
        fetch(src)
          .then(function (r) { return r.ok ? r.arrayBuffer() : Promise.reject(); })
          .then(function (buf) {
            if (buf.byteLength > 8 * 1024 * 1024) return Promise.reject();
            var ctx = new AC();
            return ctx.decodeAudioData(buf).then(function (dec) { try { ctx.close(); } catch (e) {} return dec; });
          })
          .then(function (dec) {
            // nº de barras proporcional ao espaço real (senão vazam por cima do timer)
            var N = Math.max(14, Math.min(40, Math.floor((trilha.clientWidth || 100) / 5)));
            var dados = dec.getChannelData(0);
            var passo = Math.max(1, Math.floor(dados.length / N));
            var picos = [], max = 0;
            for (var i = 0; i < N; i++) {
              var p = 0;
              for (var j = i * passo; j < (i + 1) * passo && j < dados.length; j += 24) {
                var v = Math.abs(dados[j]);
                if (v > p) p = v;
              }
              picos.push(p);
              if (p > max) max = p;
            }
            if (!max) return;
            var barras = picos.map(function (p2) {
              return '<i style="height:' + Math.max(15, Math.round((p2 / max) * 100)) + '%"></i>';
            }).join('');
            trilha.classList.add('com-onda');
            trilha.innerHTML = '<span class="onda-base">' + barras + '</span>'
              + '<span class="dm-audio-prog"><span class="onda-cheia" style="width:' + trilha.clientWidth + 'px">' + barras + '</span></span>';
            prog = trilha.querySelector('.dm-audio-prog'); // o timeupdate passa a mover a onda colorida
          })
          .catch(function () {});
      })();
      au.addEventListener('loadedmetadata', function () {
        if (isFinite(au.duration)) { mostrarDur(); return; }
        // WebM antigo sem duração nos metadados: força o navegador a calcular
        au.currentTime = 1e7;
        au.addEventListener('durationchange', function arruma() {
          if (!isFinite(au.duration)) return;
          au.removeEventListener('durationchange', arruma);
          au.currentTime = 0;
          mostrarDur();
        });
      });
      if (au.readyState >= 1) mostrarDur(); // metadados já estavam prontos antes do listener
      au.addEventListener('timeupdate', function () {
        var d = dur();
        if (d) prog.style.width = (au.currentTime / d) * 100 + '%';
        if (!au.paused || au.currentTime > 0) tempo.textContent = fmt(au.currentTime);
      });
      au.addEventListener('play', function () {
        document.querySelectorAll('.dm-audio audio').forEach(function (o) { if (o !== au) o.pause(); });
        box.classList.add('tocando');
        if (vel) vel.hidden = false;
      });
      au.addEventListener('pause', function () { box.classList.remove('tocando'); });
      au.addEventListener('ended', function () {
        box.classList.remove('tocando');
        prog.style.width = '0%';
        au.currentTime = 0;
        mostrarDur();
        if (vel) vel.hidden = true;
      });
      // Velocidade: 1x → 1,5x → 2x (como no WhatsApp)
      if (vel) vel.addEventListener('click', function () {
        var prox = au.playbackRate >= 2 ? 1 : au.playbackRate >= 1.5 ? 2 : 1.5;
        au.playbackRate = prox;
        vel.textContent = (prox === 1.5 ? '1,5' : prox) + 'x';
      });
      // Buscar: clique OU arrasto na trilha
      var buscando = false;
      function buscar(ev) {
        var d = dur();
        if (!d) return;
        var r = trilha.getBoundingClientRect();
        au.currentTime = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * d;
      }
      trilha.addEventListener('pointerdown', function (ev) {
        buscando = true;
        try { trilha.setPointerCapture(ev.pointerId); } catch (x) {}
        buscar(ev);
      });
      trilha.addEventListener('pointermove', function (ev) { if (buscando) buscar(ev); });
      ['pointerup', 'pointercancel'].forEach(function (evn) {
        trilha.addEventListener(evn, function () { buscando = false; });
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

  /* ---------- Responder mensagem (citação estilo WhatsApp) ----------
     Mobile: arrastar a bolha para a DIREITA responde. Desktop: botão ↩ na bolha.
     A barra "Respondendo a…" aparece sobre o compositor; a citação vai junto. ---------- */
  (function () {
    var msgs = document.getElementById('dmMsgs');
    var form = document.querySelector('.dm-composer');
    if (!msgs || !form) return;
    var bar = form.querySelector('[data-resp-bar]');
    var inpId = form.querySelector('[data-resp-id]');
    var elAutor = form.querySelector('[data-resp-autor]');
    var elTrecho = form.querySelector('[data-resp-trecho]');
    var ta = form.querySelector('textarea');
    if (!bar || !inpId) return;

    function trechoDe(bolha) {
      var t = bolha.querySelector('.dm-bolha-txt');
      if (t && t.textContent.trim()) return t.textContent.trim().slice(0, 90);
      if (bolha.querySelector('.dm-audio')) return '🎤 Mensagem de voz';
      if (bolha.querySelector('.dm-bolha-img, .dm-storyprev-img')) return '📷 Foto';
      if (bolha.querySelector('.dm-bolha-video')) return '🎬 Vídeo';
      return 'Mensagem';
    }
    function iniciarResposta(bolha) {
      if (!bolha || bolha.querySelector('.dm-apagada')) return;
      inpId.value = bolha.getAttribute('data-id') || '';
      if (!inpId.value) return;
      elAutor.textContent = bolha.classList.contains('minha') ? 'Você' : (form.getAttribute('data-resp-rotulo') || 'Mensagem');
      elTrecho.textContent = trechoDe(bolha);
      bar.hidden = false;
      if (ta) ta.focus();
    }
    function cancelarResposta() { inpId.value = ''; bar.hidden = true; }
    form.querySelector('[data-resp-cancelar]').addEventListener('click', cancelarResposta);

    // Desktop: botão ↩ | Mobile também tem o botão dentro do menu de segurar (via clique nele)
    msgs.addEventListener('click', function (e) {
      var b = e.target.closest('[data-responder-msg]');
      if (b) iniciarResposta(b.closest('.dm-bolha'));
      var cita = e.target.closest('[data-ir-msg]');
      if (cita) {
        var alvo = msgs.querySelector('.dm-bolha[data-id="' + cita.getAttribute('data-ir-msg') + '"]');
        if (alvo) {
          alvo.scrollIntoView({ block: 'center', behavior: 'smooth' });
          alvo.classList.add('destacada');
          setTimeout(function () { alvo.classList.remove('destacada'); }, 1400);
        }
      }
    });

    // Mobile: arrastar a bolha pra direita (a bolha acompanha o dedo e volta com mola)
    var swB = null, swX = 0, swY = 0, swOn = false;
    msgs.addEventListener('pointerdown', function (e) {
      var b = e.target.closest('.dm-bolha');
      if (!b || e.pointerType === 'mouse') return;
      if (e.target.closest('.dm-audio-trilha, .dm-audio-play, .dm-audio-vel')) return; // player tem gestos próprios
      swB = b; swX = e.clientX; swY = e.clientY; swOn = false;
    });
    msgs.addEventListener('pointermove', function (e) {
      if (!swB) return;
      var dx = e.clientX - swX, dy = e.clientY - swY;
      if (!swOn && dx > 14 && Math.abs(dx) > Math.abs(dy) * 1.4) swOn = true;
      if (swOn) {
        swB.style.transition = 'none';
        swB.style.transform = 'translateX(' + Math.min(72, dx) + 'px)';
      }
    });
    function swFim(e) {
      if (!swB) return;
      var dx = e ? e.clientX - swX : 0;
      var b = swB; swB = null;
      if (swOn) {
        b.style.transition = 'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)';
        b.style.transform = '';
        setTimeout(function () { b.style.transition = ''; }, 220);
        if (dx > 48) iniciarResposta(b);
      }
      swOn = false;
    }
    msgs.addEventListener('pointerup', swFim);
    msgs.addEventListener('pointercancel', function () { swFim(null); });
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
            + '<button type="button" class="msg-menu-op" data-mm-responder>↩️ Responder</button>'
            + '<button type="button" class="msg-menu-op" data-mm-editar>✏️ Editar</button>'
            + '<button type="button" class="msg-menu-op perigo" data-mm-apagar>🗑️ Apagar para todos</button>'
            + '<button type="button" class="msg-menu-op" data-mm-fechar>Cancelar</button>'
            + '</div>';
          document.body.appendChild(menu);
          menu.addEventListener('click', function (e) {
            var bolha = alvo;
            if (e.target.closest('[data-mm-responder]')) {
              fecharMenu();
              var rb = bolha && bolha.querySelector('[data-responder-msg]');
              if (rb) rb.click();
              return;
            }
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
          if (e.target.closest('.dm-audio-trilha, .dm-audio-play, .dm-audio-vel')) return; // player tem gestos próprios
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
