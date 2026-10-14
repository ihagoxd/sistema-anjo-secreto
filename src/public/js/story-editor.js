/* ============================================================
   Editor de Stories (estilo Instagram)
   Texto com fontes/cores/fundo, figurinhas (emoji), menção @, desenho à mão,
   story só de texto com fundo em degradê, arrastar/pinçar/girar cada elemento,
   lixeira ao arrastar para baixo, pinça/arrasto para enquadrar a foto.
   Foto e texto: tudo é "queimado" num JPEG 1080×1920 (sai igual em qualquer tela).
   Vídeo: o vídeo sobe intacto e as sobreposições vão em JSON (o visualizador desenha).
   Uso (ui.js): AnjoStoryEditor.abrir(file|null, ehVideo, { enviar: function (arquivo, meta) {} })
   ============================================================ */
(function () {
  'use strict';
  var W = 1080, H = 1920;
  var FUNDOS = [
    ['#f09433', '#dc2743', '#bc1888'], ['#1e3c72', '#2a5298', '#6dd5fa'], ['#11998e', '#38ef7d'], ['#8e2de2', '#4a00e0'],
    ['#ff512f', '#f09819'], ['#141e30', '#243b55'], ['#e3b341', '#8a5a00'], ['#ff5f6d', '#ffc371'], ['#0f0c29', '#302b63', '#24243e'], ['#000000', '#434343'],
  ];
  var CORES = ['#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#007aff', '#5856d6', '#af52de', '#ff2d55', '#e3b341'];
  var FONTES = {
    classico: { nome: 'Clássico', peso: 600, familia: "'Inter', system-ui, -apple-system, sans-serif" },
    moderno: { nome: 'Moderno', peso: 800, familia: "'Inter', system-ui, -apple-system, sans-serif", caixa: 'uppercase', espaco: 0.06 },
    maquina: { nome: 'Máquina', peso: 500, familia: "ui-monospace, Menlo, Consolas, monospace" },
    neon: { nome: 'Neon', peso: 700, familia: "'Inter', system-ui, -apple-system, sans-serif", brilho: true },
  };
  var EMOJIS = ('😀 😂 🥰 😎 🤩 🥳 😍 😘 😜 🤪 😇 🥺 😭 😤 🔥 ✨ ⭐ 💫 🎉 🎊 🎈 🎁 🎂 ❤️ 🧡 💛 💚 💙 💜 🖤 💖 💯 👏 🙌 👍 🤝 💪 🙏 👀 🫶 '
    + '☕ 🍕 🍔 🍟 🍩 🍫 🍺 🥂 🎵 🎶 🎧 📸 🚀 ✈️ 🌴 🌊 ☀️ 🌙 🌈 ⚡ 🏆 🥇 ⚽ 🏀 🎮 💼 📚 💡 🧠 😴 🥱 🤔 🤫 🤭 😏 🙃 😅 🤣 😱').split(' ').filter(Boolean);
  var BASE_TAM = 0.085; // tamanho inicial do texto = 8,5% da largura do palco

  var raiz = null, palco = null, midiaEl = null, canvasDes = null, camada = null, lixo = null;
  var txtPainel = null, txtArea = null, emojiPainel = null, desBarra = null, fundoPainel = null, enviarBtn = null;
  var est = null; // estado da edição
  var opts = null;
  var mostrandoSeq = 0;

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
  function cssFundo(i) { var c = FUNDOS[i] || FUNDOS[0]; return 'linear-gradient(160deg, ' + c.join(', ') + ')'; }
  function toastLocal(m) { if (window.toast) window.toast(m); }

  /* ---------- DOM ---------- */
  function montar() {
    if (raiz) return;
    raiz = el('div', 'sted');
    raiz.hidden = true;
    raiz.innerHTML =
      '<div class="sted-stage">'
      + '  <div class="sted-midia"></div>'
      + '  <canvas class="sted-desenho"></canvas>'
      + '  <div class="sted-camada"></div>'
      + '  <div class="sted-lixo" hidden><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></div>'
      + '  <div class="sted-topo">'
      + '    <button type="button" class="sted-ic sted-x" data-st-x aria-label="Cancelar">&times;</button>'
      + '    <div class="sted-ferr">'
      + '      <button type="button" class="sted-ic" data-st-tool="fundo" title="Fundo" aria-label="Fundo" hidden><span class="sted-fundo-dot"></span></button>'
      + '      <button type="button" class="sted-ic sted-aa" data-st-tool="texto" title="Texto" aria-label="Texto">Aa</button>'
      + '      <button type="button" class="sted-ic" data-st-tool="emoji" title="Figurinhas" aria-label="Figurinhas"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg></button>'
      + '      <button type="button" class="sted-ic sted-at" data-st-tool="mencao" title="Marcar pessoa" aria-label="Marcar pessoa">@</button>'
      + '      <button type="button" class="sted-ic" data-st-tool="desenho" title="Desenhar" aria-label="Desenhar"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg></button>'
      + '    </div>'
      + '  </div>'
      + '  <div class="sted-rodape">'
      + '    <button type="button" class="btn btn-primario sted-enviar">Compartilhar no story</button>'
      + '  </div>'
      + '</div>'
      // painel de texto
      + '<div class="sted-txt" hidden>'
      + '  <div class="sted-txt-topo"><div class="sted-fontes"></div><button type="button" class="sted-ok" data-st-txt-ok>Concluir</button></div>'
      + '  <div class="sted-txt-meio"><textarea class="sted-txt-area" rows="1" placeholder="Digite…" maxlength="300"></textarea></div>'
      + '  <div class="sted-txt-barra">'
      + '    <button type="button" class="sted-ic sted-txt-op" data-st-align title="Alinhamento" aria-label="Alinhamento"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="5" y1="18" x2="19" y2="18"/></svg></button>'
      + '    <div class="sted-cores"></div>'
      + '    <button type="button" class="sted-ic sted-txt-op sted-bg" data-st-bg title="Fundo do texto" aria-label="Fundo do texto">A</button>'
      + '  </div>'
      + '</div>'
      // painel de emoji
      + '<div class="sted-emojis" hidden><div class="sted-painel-cab"><span>Figurinhas</span><button type="button" class="sted-ok" data-st-emoji-x>Fechar</button></div><div class="sted-emoji-grade"></div></div>'
      // barra de desenho
      + '<div class="sted-desbarra" hidden>'
      + '  <button type="button" class="sted-ic" data-st-des-undo title="Desfazer" aria-label="Desfazer"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>'
      + '  <div class="sted-cores sted-des-cores"></div>'
      + '  <input type="range" class="sted-des-larg" min="2" max="24" value="7" aria-label="Espessura">'
      + '  <button type="button" class="sted-ok" data-st-des-ok>Concluir</button>'
      + '</div>'
      // painel de fundo (texto puro)
      + '<div class="sted-fundos" hidden><div class="sted-painel-cab"><span>Fundo</span><button type="button" class="sted-ok" data-st-fundo-x>Fechar</button></div><div class="sted-fundo-grade"></div></div>';
    document.body.appendChild(raiz);

    palco = raiz.querySelector('.sted-stage');
    midiaEl = raiz.querySelector('.sted-midia');
    canvasDes = raiz.querySelector('.sted-desenho');
    camada = raiz.querySelector('.sted-camada');
    lixo = raiz.querySelector('.sted-lixo');
    txtPainel = raiz.querySelector('.sted-txt');
    txtArea = raiz.querySelector('.sted-txt-area');
    emojiPainel = raiz.querySelector('.sted-emojis');
    desBarra = raiz.querySelector('.sted-desbarra');
    fundoPainel = raiz.querySelector('.sted-fundos');
    enviarBtn = raiz.querySelector('.sted-enviar');

    // fontes
    var fb = raiz.querySelector('.sted-fontes');
    Object.keys(FONTES).forEach(function (k) {
      var b = el('button', 'sted-fonte', FONTES[k].nome); b.type = 'button'; b.setAttribute('data-st-fonte', k); fb.appendChild(b);
    });
    // cores (texto e desenho)
    raiz.querySelectorAll('.sted-cores').forEach(function (box) {
      CORES.forEach(function (c) { var b = el('button', 'sted-cor'); b.type = 'button'; b.style.background = c; b.setAttribute('data-st-cor', c); box.appendChild(b); });
    });
    // emojis
    var eg = raiz.querySelector('.sted-emoji-grade');
    EMOJIS.forEach(function (e) { var b = el('button', 'sted-emoji', e); b.type = 'button'; b.setAttribute('data-st-emoji', e); eg.appendChild(b); });
    // fundos
    var fg = raiz.querySelector('.sted-fundo-grade');
    FUNDOS.forEach(function (c, i) { var b = el('button', 'sted-fundo-op'); b.type = 'button'; b.style.background = cssFundo(i); b.setAttribute('data-st-fundo', i); fg.appendChild(b); });

    ligarEventos();
  }

  /* ---------- Estado ---------- */
  function novoEstado(file, ehVideo) {
    return {
      file: file || null, ehVideo: !!ehVideo, url: file ? URL.createObjectURL(file) : '',
      textoPuro: !file, fundo: 0,
      midia: { x: 0, y: 0, s: 1 }, natural: { w: 0, h: 0 },
      overlays: [], desenhos: [], sel: -1, ferramenta: '',
      desCor: '#ffffff', desLarg: 7,
      txtEditando: -1, txtCor: '#ffffff', txtFonte: 'classico', txtFundo: false, txtAlinha: 'center',
    };
  }

  function abrir(file, ehVideo, o) {
    montar();
    opts = o || {};
    if (est && est.url) { try { URL.revokeObjectURL(est.url); } catch (e) {} }
    est = novoEstado(file, ehVideo);
    camada.innerHTML = '';
    midiaEl.innerHTML = '';
    midiaEl.style.background = '';
    var seq = ++mostrandoSeq;
    if (est.textoPuro) {
      midiaEl.style.background = cssFundo(est.fundo);
    } else if (est.ehVideo) {
      var v = document.createElement('video');
      v.src = est.url; v.autoplay = true; v.muted = true; v.loop = true; v.playsInline = true; v.controls = false;
      midiaEl.appendChild(v);
    } else {
      var img = document.createElement('img');
      img.alt = '';
      img.onload = function () { if (seq === mostrandoSeq) { est.natural = { w: img.naturalWidth, h: img.naturalHeight }; aplicarMidia(); } };
      img.src = est.url;
      midiaEl.appendChild(img);
    }
    raiz.querySelector('[data-st-tool="fundo"]').hidden = !est.textoPuro;
    raiz.querySelector('[data-st-tool="desenho"]').hidden = est.ehVideo;
    raiz.querySelector('.sted-fundo-dot').style.background = cssFundo(est.fundo);
    enviarBtn.disabled = false; enviarBtn.textContent = 'Compartilhar no story';
    fecharPaineis();
    raiz.hidden = false;
    document.body.classList.add('sem-scroll');
    ajustarCanvas();
    aplicarMidia();
    renderOverlays();
    if (est.textoPuro) setTimeout(function () { abrirTexto(-1); }, 120); // story de texto: já abre o teclado
  }

  function fechar() {
    if (!raiz || raiz.hidden) return;
    raiz.hidden = true;
    document.body.classList.remove('sem-scroll');
    fecharPaineis();
    if (est && est.url) { try { URL.revokeObjectURL(est.url); } catch (e) {} }
    midiaEl.innerHTML = '';
    est = null;
  }

  function fecharPaineis() {
    txtPainel.hidden = true; emojiPainel.hidden = true; desBarra.hidden = true; fundoPainel.hidden = true;
    raiz.classList.remove('desenhando', 'editando-texto');
    if (est) est.ferramenta = '';
    raiz.querySelectorAll('[data-st-tool]').forEach(function (b) { b.classList.remove('ativo'); });
  }

  /* ---------- Mídia (foto): enquadrar com arrasto e pinça ---------- */
  function aplicarMidia() {
    var img = midiaEl.querySelector('img');
    if (!img || !est) return;
    img.style.transform = 'translate(' + est.midia.x + 'px, ' + est.midia.y + 'px) scale(' + est.midia.s + ')';
  }
  function limitarMidia() {
    // não deixa aparecer borda vazia: a foto (cover) sempre cobre o palco
    var r = palco.getBoundingClientRect();
    var s = est.midia.s;
    var extraX = (r.width * s - r.width) / 2, extraY = (r.height * s - r.height) / 2;
    est.midia.x = Math.max(-extraX, Math.min(extraX, est.midia.x));
    est.midia.y = Math.max(-extraY, Math.min(extraY, est.midia.y));
  }

  /* ---------- Overlays ---------- */
  function estiloOverlay(div, ov) {
    var r = palco.getBoundingClientRect();
    div.style.left = (ov.x * 100) + '%';
    div.style.top = (ov.y * 100) + '%';
    div.style.transform = 'translate(-50%, -50%) rotate(' + ov.rot + 'deg)';
    div.style.fontSize = (ov.tam * r.width) + 'px';
    if (ov.tipo === 'texto') {
      var f = FONTES[ov.fonte] || FONTES.classico;
      div.style.fontFamily = f.familia; div.style.fontWeight = f.peso;
      div.style.textTransform = f.caixa || 'none';
      div.style.letterSpacing = f.espaco ? (f.espaco + 'em') : '0';
      div.style.textAlign = ov.alinhamento;
      div.style.color = ov.fundo ? contraste(ov.cor) : ov.cor;
      div.style.textShadow = f.brilho ? ('0 0 10px ' + ov.cor + ', 0 0 24px ' + ov.cor) : (ov.fundo ? 'none' : '0 1px 3px rgba(0,0,0,0.45)');
      div.classList.toggle('com-fundo', !!ov.fundo);
      div.style.setProperty('--ov-fundo', ov.fundo ? ov.cor : 'transparent');
    }
  }
  function contraste(hex) {
    var c = hex.replace('#', ''); var r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111111' : '#ffffff';
  }
  function renderOverlays() {
    camada.innerHTML = '';
    if (!est) return;
    est.overlays.forEach(function (ov, i) {
      var div = el('div', 'st-ov st-ov-' + ov.tipo);
      div.setAttribute('data-i', i);
      if (ov.tipo === 'mencao') div.innerHTML = '<span class="st-ov-inner">@' + esc(ov.usuario) + '</span>';
      else div.innerHTML = '<span class="st-ov-inner">' + esc(ov.texto).replace(/\n/g, '<br>') + '</span>';
      estiloOverlay(div, ov);
      div.classList.toggle('sel', i === est.sel);
      camada.appendChild(div);
    });
  }
  function addOverlay(ov) {
    est.overlays.push(ov);
    est.sel = est.overlays.length - 1;
    renderOverlays();
    var div = camada.lastElementChild;
    if (div) { div.classList.add('entrando'); setTimeout(function () { div.classList.remove('entrando'); }, 350); }
  }

  /* ---------- Gestos (arrastar, pinçar, girar, lixeira, enquadrar foto) ---------- */
  var ptrs = {}, gesto = null;
  function pos(e) { return { x: e.clientX, y: e.clientY }; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function ang(a, b) { return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; }

  function ligarEventos() {
    palco.addEventListener('pointerdown', function (e) {
      if (!est || est.ferramenta === 'desenho' || !txtPainel.hidden) return;
      if (e.target.closest('.sted-topo, .sted-rodape')) return;
      ptrs[e.pointerId] = pos(e);
      try { palco.setPointerCapture(e.pointerId); } catch (x) {}
      var ids = Object.keys(ptrs);
      var alvo = e.target.closest('.st-ov');
      if (ids.length === 1) {
        if (alvo) {
          var i = parseInt(alvo.getAttribute('data-i'), 10);
          est.sel = i; renderOverlays();
          var ov = est.overlays[i];
          gesto = { tipo: 'ov', i: i, ini: pos(e), x0: ov.x, y0: ov.y, rot0: ov.rot, tam0: ov.tam, moveu: 0, t0: Date.now() };
        } else if (!est.ehVideo && !est.textoPuro) {
          gesto = { tipo: 'midia', ini: pos(e), x0: est.midia.x, y0: est.midia.y, s0: est.midia.s, moveu: 0 };
          est.sel = -1; renderOverlays();
        } else {
          est.sel = -1; renderOverlays(); gesto = null;
        }
      } else if (ids.length === 2) {
        var a = ptrs[ids[0]], b = ptrs[ids[1]];
        if (gesto && gesto.tipo === 'ov') { gesto.pinch0 = dist(a, b); gesto.ang0 = ang(a, b); gesto.tam0 = est.overlays[gesto.i].tam; gesto.rot0 = est.overlays[gesto.i].rot; }
        else if (gesto && gesto.tipo === 'midia') { gesto.pinch0 = dist(a, b); gesto.s0 = est.midia.s; }
      }
    });
    palco.addEventListener('pointermove', function (e) {
      if (!ptrs[e.pointerId] || !gesto || !est) return;
      ptrs[e.pointerId] = pos(e);
      var ids = Object.keys(ptrs);
      var r = palco.getBoundingClientRect();
      if (gesto.tipo === 'ov') {
        var ov = est.overlays[gesto.i];
        if (!ov) return;
        if (ids.length >= 2 && gesto.pinch0) {
          var a = ptrs[ids[0]], b = ptrs[ids[1]];
          ov.tam = Math.max(0.03, Math.min(0.6, gesto.tam0 * (dist(a, b) / gesto.pinch0)));
          ov.rot = gesto.rot0 + (ang(a, b) - gesto.ang0);
        } else {
          var p = ptrs[e.pointerId];
          var dx = p.x - gesto.ini.x, dy = p.y - gesto.ini.y;
          gesto.moveu = Math.max(gesto.moveu, Math.abs(dx) + Math.abs(dy));
          ov.x = Math.max(0.02, Math.min(0.98, gesto.x0 + dx / r.width));
          ov.y = Math.max(0.02, Math.min(0.98, gesto.y0 + dy / r.height));
          lixo.hidden = gesto.moveu < 10;
          var lr = lixo.getBoundingClientRect();
          var sobre = p.x > lr.left - 20 && p.x < lr.right + 20 && p.y > lr.top - 20 && p.y < lr.bottom + 20;
          lixo.classList.toggle('pronto', sobre);
          gesto.naLixeira = sobre;
        }
        var div = camada.querySelector('.st-ov[data-i="' + gesto.i + '"]');
        if (div) estiloOverlay(div, ov);
      } else if (gesto.tipo === 'midia') {
        if (ids.length >= 2 && gesto.pinch0) {
          var a2 = ptrs[ids[0]], b2 = ptrs[ids[1]];
          est.midia.s = Math.max(1, Math.min(4, gesto.s0 * (dist(a2, b2) / gesto.pinch0)));
        } else {
          var p2 = ptrs[e.pointerId];
          est.midia.x = gesto.x0 + (p2.x - gesto.ini.x);
          est.midia.y = gesto.y0 + (p2.y - gesto.ini.y);
          gesto.moveu = Math.max(gesto.moveu, Math.abs(p2.x - gesto.ini.x) + Math.abs(p2.y - gesto.ini.y));
        }
        limitarMidia(); aplicarMidia();
      }
    });
    function soltar(e) {
      delete ptrs[e.pointerId];
      if (Object.keys(ptrs).length) return;
      if (gesto && gesto.tipo === 'ov' && est) {
        var i = gesto.i;
        if (gesto.naLixeira) { est.overlays.splice(i, 1); est.sel = -1; renderOverlays(); try { if (navigator.vibrate) navigator.vibrate(20); } catch (x) {} }
        else if (gesto.moveu < 8 && Date.now() - gesto.t0 < 400) {
          var ov = est.overlays[i];
          if (ov && ov.tipo === 'texto') abrirTexto(i); // toque no texto edita
        }
      }
      lixo.hidden = true; lixo.classList.remove('pronto');
      gesto = null;
    }
    palco.addEventListener('pointerup', soltar);
    palco.addEventListener('pointercancel', soltar);
    palco.addEventListener('wheel', function (e) {
      if (!est || est.ehVideo || est.textoPuro) return;
      e.preventDefault();
      est.midia.s = Math.max(1, Math.min(4, est.midia.s + (e.deltaY < 0 ? 0.15 : -0.15)));
      limitarMidia(); aplicarMidia();
    }, { passive: false });

    // ferramentas
    raiz.addEventListener('click', function (e) {
      var x = e.target.closest('[data-st-x]');
      if (x) { if (est && (est.overlays.length || est.desenhos.length) && !window.confirm('Descartar este story?')) return; fechar(); if (opts && opts.aoCancelar) opts.aoCancelar(); return; }
      var t = e.target.closest('[data-st-tool]');
      if (t) { var f = t.getAttribute('data-st-tool'); ferramenta(f); return; }
      if (e.target.closest('[data-st-txt-ok]')) { concluirTexto(); return; }
      if (e.target.closest('[data-st-emoji-x]') || e.target.closest('[data-st-fundo-x]')) { fecharPaineis(); return; }
      if (e.target.closest('[data-st-des-ok]')) { fecharPaineis(); return; }
      if (e.target.closest('[data-st-des-undo]')) { est.desenhos.pop(); redesenhar(); return; }
      var em = e.target.closest('[data-st-emoji]');
      if (em) { addOverlay({ tipo: 'emoji', texto: em.getAttribute('data-st-emoji'), x: 0.5, y: 0.45, rot: 0, tam: 0.22 }); fecharPaineis(); return; }
      var fo = e.target.closest('[data-st-fundo]');
      if (fo) { est.fundo = parseInt(fo.getAttribute('data-st-fundo'), 10) || 0; midiaEl.style.background = cssFundo(est.fundo); raiz.querySelector('.sted-fundo-dot').style.background = cssFundo(est.fundo); return; }
      var fonte = e.target.closest('[data-st-fonte]');
      if (fonte) { est.txtFonte = fonte.getAttribute('data-st-fonte'); aplicarEstiloArea(); return; }
      var cor = e.target.closest('[data-st-cor]');
      if (cor) {
        if (cor.closest('.sted-des-cores')) { est.desCor = cor.getAttribute('data-st-cor'); marcarCor(); }
        else { est.txtCor = cor.getAttribute('data-st-cor'); aplicarEstiloArea(); }
        return;
      }
      if (e.target.closest('[data-st-align]')) { est.txtAlinha = est.txtAlinha === 'center' ? 'left' : est.txtAlinha === 'left' ? 'right' : 'center'; aplicarEstiloArea(); return; }
      if (e.target.closest('[data-st-bg]')) { est.txtFundo = !est.txtFundo; aplicarEstiloArea(); return; }
      if (e.target.closest('.sted-enviar')) { enviar(); return; }
      // toque no vazio com o painel de texto aberto = concluir
      if (!txtPainel.hidden && e.target === txtPainel) concluirTexto();
    });
    raiz.querySelector('.sted-des-larg').addEventListener('input', function (e) { est.desLarg = parseInt(e.target.value, 10) || 7; });
    txtArea.addEventListener('input', function () { txtArea.style.height = 'auto'; txtArea.style.height = txtArea.scrollHeight + 'px'; });
    txtArea.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); concluirTexto(); } });

    // Desenho (canvas): pointer events só com a ferramenta ativa
    var tracando = null;
    canvasDes.addEventListener('pointerdown', function (e) {
      if (!est || est.ferramenta !== 'desenho') return;
      try { canvasDes.setPointerCapture(e.pointerId); } catch (x) {}
      var r = palco.getBoundingClientRect();
      tracando = { cor: est.desCor, larg: est.desLarg / r.width, pontos: [[(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]] };
      est.desenhos.push(tracando);
      redesenhar();
    });
    canvasDes.addEventListener('pointermove', function (e) {
      if (!tracando) return;
      var r = palco.getBoundingClientRect();
      tracando.pontos.push([(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]);
      redesenhar();
    });
    function fimTraco() { tracando = null; }
    canvasDes.addEventListener('pointerup', fimTraco);
    canvasDes.addEventListener('pointercancel', fimTraco);
    window.addEventListener('resize', function () { if (raiz && !raiz.hidden) { ajustarCanvas(); renderOverlays(); } });
  }

  function ferramenta(f) {
    if (!est) return;
    var jaAtiva = est.ferramenta === f;
    fecharPaineis();
    if (jaAtiva) return;
    if (f === 'texto') { abrirTexto(-1); return; }
    if (f === 'emoji') { emojiPainel.hidden = false; }
    if (f === 'fundo') { fundoPainel.hidden = false; }
    if (f === 'desenho') { desBarra.hidden = false; raiz.classList.add('desenhando'); marcarCor(); }
    if (f === 'mencao') {
      if (!window.__abrirSeletorPessoa) { toastLocal('Marcação indisponível.'); return; }
      window.__abrirSeletorPessoa('Marcar pessoas no story', function (pessoas) {
        pessoas.forEach(function (p, k) {
          addOverlay({ tipo: 'mencao', id_usuario: Number(p.id), usuario: p.usuario, texto: '@' + p.usuario, x: 0.5, y: Math.min(0.9, 0.6 + k * 0.09), rot: 0, tam: 0.07 });
        });
      });
      return;
    }
    est.ferramenta = f;
    var b = raiz.querySelector('[data-st-tool="' + f + '"]'); if (b) b.classList.add('ativo');
  }
  function marcarCor() {
    raiz.querySelectorAll('.sted-des-cores .sted-cor').forEach(function (c) { c.classList.toggle('sel', c.getAttribute('data-st-cor') === est.desCor); });
    raiz.querySelectorAll('.sted-txt .sted-cor').forEach(function (c) { c.classList.toggle('sel', c.getAttribute('data-st-cor') === est.txtCor); });
  }

  /* ---------- Texto ---------- */
  function abrirTexto(i) {
    est.txtEditando = i;
    var ov = i >= 0 ? est.overlays[i] : null;
    if (ov) { est.txtCor = ov.cor; est.txtFonte = ov.fonte; est.txtFundo = !!ov.fundo; est.txtAlinha = ov.alinhamento; txtArea.value = ov.texto; }
    else txtArea.value = '';
    txtPainel.hidden = false;
    raiz.classList.add('editando-texto');
    aplicarEstiloArea();
    txtArea.style.height = 'auto';
    setTimeout(function () { txtArea.focus(); txtArea.style.height = txtArea.scrollHeight + 'px'; }, 30);
  }
  function aplicarEstiloArea() {
    var f = FONTES[est.txtFonte] || FONTES.classico;
    txtArea.style.fontFamily = f.familia; txtArea.style.fontWeight = f.peso;
    txtArea.style.textTransform = f.caixa || 'none'; txtArea.style.letterSpacing = f.espaco ? (f.espaco + 'em') : '0';
    txtArea.style.textAlign = est.txtAlinha;
    txtArea.style.color = est.txtFundo ? contraste(est.txtCor) : est.txtCor;
    txtArea.style.background = est.txtFundo ? est.txtCor : 'transparent';
    txtArea.style.textShadow = f.brilho ? ('0 0 10px ' + est.txtCor + ', 0 0 22px ' + est.txtCor) : 'none';
    raiz.querySelectorAll('.sted-fonte').forEach(function (b) { b.classList.toggle('sel', b.getAttribute('data-st-fonte') === est.txtFonte); });
    raiz.querySelector('[data-st-bg]').classList.toggle('ativo', !!est.txtFundo);
    marcarCor();
  }
  function concluirTexto() {
    var texto = txtArea.value.replace(/\s+$/, '');
    var i = est.txtEditando;
    txtPainel.hidden = true; raiz.classList.remove('editando-texto');
    txtArea.blur();
    if (!texto.trim()) { if (i >= 0) { est.overlays.splice(i, 1); est.sel = -1; renderOverlays(); } else if (est.textoPuro && !est.overlays.length) { /* story de texto vazio: fica aberto */ } return; }
    if (i >= 0) {
      var ov = est.overlays[i];
      ov.texto = texto; ov.cor = est.txtCor; ov.fonte = est.txtFonte; ov.fundo = est.txtFundo; ov.alinhamento = est.txtAlinha;
      renderOverlays();
    } else {
      addOverlay({ tipo: 'texto', texto: texto, cor: est.txtCor, fonte: est.txtFonte, fundo: est.txtFundo, alinhamento: est.txtAlinha, x: 0.5, y: 0.45, rot: 0, tam: BASE_TAM });
    }
  }

  /* ---------- Desenho ---------- */
  function ajustarCanvas() {
    var r = palco.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    canvasDes.width = Math.round(r.width * dpr); canvasDes.height = Math.round(r.height * dpr);
    canvasDes.style.width = r.width + 'px'; canvasDes.style.height = r.height + 'px';
    redesenhar();
  }
  function tracar(ctx, w, h, lista) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    lista.forEach(function (d) {
      ctx.strokeStyle = d.cor; ctx.lineWidth = d.larg * w;
      ctx.beginPath();
      d.pontos.forEach(function (p, i) { if (i === 0) ctx.moveTo(p[0] * w, p[1] * h); else ctx.lineTo(p[0] * w, p[1] * h); });
      if (d.pontos.length === 1) ctx.lineTo(d.pontos[0][0] * w + 0.1, d.pontos[0][1] * h);
      ctx.stroke();
    });
  }
  function redesenhar() {
    if (!est) return;
    var ctx = canvasDes.getContext('2d');
    ctx.clearRect(0, 0, canvasDes.width, canvasDes.height);
    tracar(ctx, canvasDes.width, canvasDes.height, est.desenhos);
  }

  /* ---------- Renderização final (foto / texto) ---------- */
  function quebrarLinhas(ctx, texto, maxW) {
    var saida = [];
    texto.split('\n').forEach(function (linha) {
      var palavras = linha.split(' '), atual = '';
      palavras.forEach(function (p) {
        var teste = atual ? atual + ' ' + p : p;
        if (ctx.measureText(teste).width > maxW && atual) { saida.push(atual); atual = p; } else atual = teste;
      });
      saida.push(atual);
    });
    return saida;
  }
  function desenharOverlay(ctx, ov, pw, ph) {
    var cx = ov.x * pw, cy = ov.y * ph;
    var tam = ov.tam * pw;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ov.rot * Math.PI / 180);
    if (ov.tipo === 'emoji') {
      ctx.font = tam + 'px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ov.texto, 0, 0);
    } else if (ov.tipo === 'mencao') {
      ctx.font = '700 ' + tam + "px 'Inter', system-ui, sans-serif";
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var t = '@' + ov.usuario;
      var w = ctx.measureText(t).width + tam * 0.9, h = tam * 1.5;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      arredondado(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.fillText(t, 0, tam * 0.06);
    } else {
      var f = FONTES[ov.fonte] || FONTES.classico;
      var texto = f.caixa === 'uppercase' ? ov.texto.toUpperCase() : ov.texto;
      ctx.font = f.peso + ' ' + tam + 'px ' + f.familia;
      ctx.textBaseline = 'middle';
      if (f.espaco && ctx.letterSpacing !== undefined) ctx.letterSpacing = (f.espaco * tam) + 'px';
      var linhas = quebrarLinhas(ctx, texto, pw * 0.86);
      var lh = tam * 1.25;
      var larguras = linhas.map(function (l) { return ctx.measureText(l).width; });
      var maxL = Math.max.apply(null, larguras.concat([0]));
      var alinha = ov.alinhamento;
      ctx.textAlign = alinha;
      var x0 = alinha === 'left' ? -maxL / 2 : alinha === 'right' ? maxL / 2 : 0;
      var yIni = -((linhas.length - 1) * lh) / 2;
      if (ov.fundo) {
        ctx.fillStyle = ov.cor;
        linhas.forEach(function (l, i) {
          var lw = larguras[i] + tam * 0.5, lx = alinha === 'left' ? -maxL / 2 - tam * 0.25 : alinha === 'right' ? maxL / 2 - lw + tam * 0.25 : -lw / 2;
          arredondado(ctx, lx, yIni + i * lh - lh / 2 + tam * 0.06, lw, lh, tam * 0.25); ctx.fill();
        });
        ctx.fillStyle = contraste(ov.cor);
      } else {
        ctx.fillStyle = ov.cor;
        if (f.brilho) { ctx.shadowColor = ov.cor; ctx.shadowBlur = tam * 0.55; }
        else { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = tam * 0.12; ctx.shadowOffsetY = tam * 0.04; }
      }
      linhas.forEach(function (l, i) { ctx.fillText(l, x0, yIni + i * lh); });
    }
    ctx.restore();
  }
  function arredondado(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function renderizarImagem() {
    return new Promise(function (resolve, reject) {
      try {
        var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        var ctx = cv.getContext('2d');
        var r = palco.getBoundingClientRect();
        var k = W / r.width; // palco → canvas
        if (est.textoPuro) {
          var cores = FUNDOS[est.fundo] || FUNDOS[0];
          var g = ctx.createLinearGradient(0, 0, W * 0.6, H);
          cores.forEach(function (c, i) { g.addColorStop(i / (cores.length - 1), c); });
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        } else {
          var img = midiaEl.querySelector('img');
          var iw = est.natural.w || img.naturalWidth, ih = est.natural.h || img.naturalHeight;
          var cover = Math.max(r.width / iw, r.height / ih);
          var dw = iw * cover * est.midia.s, dh = ih * cover * est.midia.s;
          var dx = (r.width - dw) / 2 + est.midia.x, dy = (r.height - dh) / 2 + est.midia.y;
          ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
          ctx.drawImage(img, dx * k, dy * k, dw * k, dh * k);
        }
        tracar(ctx, W, H, est.desenhos);
        est.overlays.forEach(function (ov) { desenharOverlay(ctx, ov, W, H); });
        cv.toBlob(function (blob) { if (blob) resolve(blob); else reject(new Error('sem blob')); }, 'image/jpeg', 0.92);
      } catch (e) { reject(e); }
    });
  }

  /* ---------- Enviar ---------- */
  function sobreposicoesJson(soMencoes) {
    return est.overlays
      .filter(function (ov) { return !soMencoes || ov.tipo === 'mencao'; })
      .map(function (ov) {
        var o = { tipo: ov.tipo, x: +ov.x.toFixed(4), y: +ov.y.toFixed(4), rot: +ov.rot.toFixed(2), tam: +ov.tam.toFixed(4), texto: ov.texto };
        if (ov.tipo === 'texto') { o.cor = ov.cor; o.fundo = !!ov.fundo; o.fonte = ov.fonte; o.alinhamento = ov.alinhamento; }
        if (ov.tipo === 'mencao') { o.id_usuario = ov.id_usuario; o.usuario = ov.usuario; }
        return o;
      });
  }
  function enviar() {
    if (!est || !opts || !opts.enviar) return;
    if (est.textoPuro && !est.overlays.length && !est.desenhos.length) { toastLocal('Escreva alguma coisa no seu story.'); abrirTexto(-1); return; }
    enviarBtn.disabled = true; enviarBtn.textContent = 'Preparando…';
    var mencoes = est.overlays.filter(function (o) { return o.tipo === 'mencao'; }).map(function (o) { return o.id_usuario; });
    var fim = function (arquivo, meta) {
      var p = opts.enviar(arquivo, meta);
      Promise.resolve(p).then(function () { fechar(); }).catch(function () { enviarBtn.disabled = false; enviarBtn.textContent = 'Compartilhar no story'; });
    };
    if (est.ehVideo) {
      fim(est.file, { ehVideo: true, sobreposicoes: sobreposicoesJson(false), mencoes: mencoes });
    } else {
      // Fonte precisa estar carregada para o canvas desenhar igual ao preview
      var pronto = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
      pronto.then(renderizarImagem).then(function (blob) {
        fim(new File([blob], 'story.jpg', { type: 'image/jpeg' }), { ehVideo: false, sobreposicoes: sobreposicoesJson(true), mencoes: mencoes });
      }).catch(function () { enviarBtn.disabled = false; enviarBtn.textContent = 'Compartilhar no story'; toastLocal('Não foi possível montar o story.'); });
    }
  }

  // Desenha as sobreposições de um story de VÍDEO (ou as menções clicáveis de uma foto) num container
  function renderEm(container, lista, largura, soMencoes) {
    container.innerHTML = '';
    if (!lista || !lista.length) return;
    var fake = { getBoundingClientRect: function () { return { width: largura }; } };
    lista.forEach(function (ov) {
      if (soMencoes && ov.tipo !== 'mencao') return;
      var div = el('div', 'st-ov st-ov-' + ov.tipo + (soMencoes ? ' st-ov-oculta' : ''));
      if (ov.tipo === 'mencao') { div.innerHTML = '<a class="st-ov-inner" href="/u/' + encodeURIComponent(ov.usuario) + '">@' + esc(ov.usuario) + '</a>'; }
      else div.innerHTML = '<span class="st-ov-inner">' + esc(ov.texto).replace(/\n/g, '<br>') + '</span>';
      var p0 = palco; palco = fake; // estiloOverlay usa a largura do palco
      try { estiloOverlay(div, Object.assign({ fonte: 'classico', cor: '#fff', alinhamento: 'center' }, ov)); } finally { palco = p0; }
      container.appendChild(div);
    });
  }

  window.AnjoStoryEditor = { abrir: abrir, fechar: fechar, renderEm: renderEm, FONTES: FONTES };
})();
