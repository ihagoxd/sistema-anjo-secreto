/* ============================================================
   Editor de Stories (estilo Instagram)
   Texto digitado direto na tela com fonte, cor, fundo em "pílula" por linha, alinhamento e
   tamanho (slider); "@" no texto abre a lista de perfis — vira figurinha de menção que a pessoa
   posiciona; emoji vem do teclado. Menção @ (botão), desenho à mão, story só de texto com fundo
   em degradê, arrastar/pinçar/girar cada elemento, lixeira ao arrastar para baixo, pinça/arrasto
   para enquadrar a foto.
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
  var SANS = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  var FONTES = {
    classico: { nome: 'Clássico', peso: 600, familia: SANS },
    moderno: { nome: 'Moderno', peso: 800, familia: SANS, caixa: 'uppercase', espaco: 0.06 },
    forte: { nome: 'Forte', peso: 400, familia: "Impact, 'Arial Narrow Bold', 'Arial Black', sans-serif", caixa: 'uppercase', espaco: 0.02 },
    elegante: { nome: 'Elegante', peso: 400, familia: "Georgia, 'Times New Roman', serif", italico: true },
    maquina: { nome: 'Máquina', peso: 500, familia: "ui-monospace, Menlo, Consolas, 'Courier New', monospace" },
    neon: { nome: 'Neon', peso: 700, familia: SANS, brilho: true },
  };
  var BASE_TAM = 0.085, TAM_MIN = 0.04, TAM_MAX = 0.2; // tamanho do texto = fração da largura do palco
  var MAX_TEXTO = 300;

  var raiz = null, palco = null, midiaEl = null, canvasDes = null, camada = null, lixo = null;
  var txtPainel = null, txtIn = null, txtWrap = null, txtTam = null, mencBox = null, desBarra = null, fundoPainel = null, enviarBtn = null;
  var est = null; // estado da edição
  var opts = null;
  var mostrandoSeq = 0, seqOv = 0, mencSeq = 0, mencTimer = null;

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
  function cssFundo(i) { var c = FUNDOS[i] || FUNDOS[0]; return 'linear-gradient(160deg, ' + c.join(', ') + ')'; }
  function toastLocal(m) { if (window.toast) window.toast(m); }
  function luminancia(hex) {
    var c = String(hex || '#ffffff').replace('#', '');
    if (c.length !== 6) return 255;
    return (parseInt(c.slice(0, 2), 16) * 299 + parseInt(c.slice(2, 4), 16) * 587 + parseInt(c.slice(4, 6), 16) * 114) / 1000;
  }
  function contraste(hex) { return luminancia(hex) > 150 ? '#111111' : '#ffffff'; }
  // Modo de fundo do texto: 0 nenhum · 1 sólido (texto em contraste) · 2 translúcido (texto na cor)
  function modoFundo(v) { if (v === true) return 1; var n = Number(v); return n === 1 || n === 2 ? n : 0; }
  function coresTexto(cor, modo) {
    if (modo === 1) return { bg: cor, cor: contraste(cor) };
    if (modo === 2) return { bg: luminancia(cor) > 150 ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.68)', cor: cor };
    return { bg: 'transparent', cor: cor };
  }
  function fonteCss(f) { return (f.italico ? 'italic ' : '') + f.peso + ' '; }

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
      + '      <button type="button" class="sted-ic sted-at" data-st-tool="mencao" title="Marcar pessoa" aria-label="Marcar pessoa">@</button>'
      + '      <button type="button" class="sted-ic" data-st-tool="desenho" title="Desenhar" aria-label="Desenhar"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg></button>'
      + '    </div>'
      + '  </div>'
      + '  <div class="sted-rodape">'
      + '    <button type="button" class="btn btn-primario sted-enviar">Compartilhar no story</button>'
      + '  </div>'
      + '</div>'
      // ferramenta de texto (Instagram): escreve direto na tela
      + '<div class="sted-txt" hidden>'
      + '  <div class="sted-txt-topo">'
      + '    <button type="button" class="sted-ic sted-txt-op" data-st-align title="Alinhamento" aria-label="Alinhamento"></button>'
      + '    <button type="button" class="sted-ic sted-txt-op sted-bg" data-st-bg title="Fundo do texto" aria-label="Fundo do texto"><span>A</span></button>'
      + '    <span class="sted-txt-espaco"></span>'
      + '    <button type="button" class="sted-ok" data-st-txt-ok>Concluir</button>'
      + '  </div>'
      + '  <div class="sted-txt-meio" data-st-txt-meio>'
      + '    <div class="sted-txt-wrap"><div class="sted-txt-in" contenteditable="true" spellcheck="false" autocapitalize="sentences" enterkeyhint="enter" data-placeholder="Digite…"></div></div>'
      + '  </div>'
      + '  <input type="range" class="sted-txt-tam" min="' + TAM_MIN + '" max="' + TAM_MAX + '" step="0.002" value="' + BASE_TAM + '" aria-label="Tamanho do texto">'
      + '  <div class="sted-txt-base">'
      + '    <div class="sted-mencoes" hidden></div>'
      + '    <div class="sted-cores"></div>'
      + '    <div class="sted-fontes"></div>'
      + '  </div>'
      + '</div>'
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
    txtIn = raiz.querySelector('.sted-txt-in');
    txtWrap = raiz.querySelector('.sted-txt-wrap');
    txtTam = raiz.querySelector('.sted-txt-tam');
    mencBox = raiz.querySelector('.sted-mencoes');
    desBarra = raiz.querySelector('.sted-desbarra');
    fundoPainel = raiz.querySelector('.sted-fundos');
    enviarBtn = raiz.querySelector('.sted-enviar');

    // fontes (cada pílula na própria fonte)
    var fb = raiz.querySelector('.sted-fontes');
    Object.keys(FONTES).forEach(function (k) {
      var f = FONTES[k];
      var b = el('button', 'sted-fonte', f.nome); b.type = 'button'; b.setAttribute('data-st-fonte', k);
      b.style.fontFamily = f.familia; b.style.fontWeight = f.peso; if (f.italico) b.style.fontStyle = 'italic';
      if (f.caixa) b.style.textTransform = f.caixa; if (f.espaco) b.style.letterSpacing = f.espaco + 'em';
      fb.appendChild(b);
    });
    // cores (texto e desenho)
    raiz.querySelectorAll('.sted-cores').forEach(function (box) {
      CORES.forEach(function (c) { var b = el('button', 'sted-cor'); b.type = 'button'; b.style.background = c; b.setAttribute('data-st-cor', c); b.setAttribute('aria-label', 'Cor'); box.appendChild(b); });
    });
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
      txtEditando: -1, txtCor: '#ffffff', txtFonte: 'classico', txtFundo: 0, txtAlinha: 'center', txtTam: BASE_TAM, txtMencoes: {},
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
    if (est.textoPuro) setTimeout(function () { abrirTexto(-1, ''); }, 120); // story de texto: já abre o teclado
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
    if (!txtPainel.hidden) fecharTexto();
    desBarra.hidden = true; fundoPainel.hidden = true;
    raiz.classList.remove('desenhando');
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
    var r = palco.getBoundingClientRect();
    var s = est.midia.s;
    var extraX = (r.width * s - r.width) / 2, extraY = (r.height * s - r.height) / 2;
    est.midia.x = Math.max(-extraX, Math.min(extraX, est.midia.x));
    est.midia.y = Math.max(-extraY, Math.min(extraY, est.midia.y));
  }

  /* ---------- Overlays ---------- */
  function aplicarFonte(elm, f) {
    elm.style.fontFamily = f.familia; elm.style.fontWeight = f.peso;
    elm.style.fontStyle = f.italico ? 'italic' : 'normal';
    elm.style.textTransform = f.caixa || 'none';
    elm.style.letterSpacing = f.espaco ? (f.espaco + 'em') : '0';
  }
  function sombraTexto(f, cor, modo) {
    if (modo) return 'none';
    return f.brilho ? ('0 0 10px ' + cor + ', 0 0 24px ' + cor) : '0 1px 3px rgba(0,0,0,0.45)';
  }
  function estiloOverlay(div, ov) {
    var r = palco.getBoundingClientRect();
    div.style.left = (ov.x * 100) + '%';
    div.style.top = (ov.y * 100) + '%';
    div.style.transform = 'translate(-50%, -50%) rotate(' + ov.rot + 'deg)';
    div.style.fontSize = (ov.tam * r.width) + 'px';
    if (ov.tipo === 'texto') {
      var f = FONTES[ov.fonte] || FONTES.classico;
      var modo = modoFundo(ov.fundo), c = coresTexto(ov.cor, modo);
      aplicarFonte(div, f);
      div.style.textAlign = ov.alinhamento;
      div.style.color = c.cor;
      div.style.textShadow = sombraTexto(f, ov.cor, modo);
      div.classList.toggle('com-fundo', modo > 0);
      div.style.setProperty('--ov-fundo', c.bg);
      div.style.setProperty('--ov-cor', c.cor);
    }
    if (ov.tipo === 'mencao') div.classList.toggle('st-ov-oculta', !!ov.oculta);
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
      if (ov.tipo === 'mencao' && ov.oculta) div.classList.add('st-ov-ligada'); // menção dentro de um texto: invisível, não pega gesto
      div.classList.toggle('sel', i === est.sel && !ov.oculta);
      div.classList.toggle('editando', !txtPainel.hidden && i === est.txtEditando);
      camada.appendChild(div);
    });
  }
  function addOverlay(ov) {
    if (!ov.id) ov.id = ++seqOv;
    est.overlays.push(ov);
    est.sel = est.overlays.length - 1;
    renderOverlays();
    var div = camada.lastElementChild;
    if (div) { div.classList.add('entrando'); setTimeout(function () { div.classList.remove('entrando'); }, 350); }
    return ov;
  }
  // Menções que vivem dentro de um texto acompanham o texto (posição, giro, tamanho) e somem com ele
  function sincronizarLigadas(ovTexto) {
    est.overlays.forEach(function (o) {
      if (o.tipo === 'mencao' && o.oculta && o.ligado === ovTexto.id) { o.x = ovTexto.x; o.y = ovTexto.y; o.rot = ovTexto.rot; o.tam = ovTexto.tam; }
    });
  }
  function removerOverlay(i) {
    var ov = est.overlays[i];
    if (!ov) return;
    est.overlays.splice(i, 1);
    if (ov.tipo === 'texto') est.overlays = est.overlays.filter(function (o) { return !(o.tipo === 'mencao' && o.oculta && o.ligado === ov.id); });
    est.sel = -1;
    renderOverlays();
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
      var alvo = e.target.closest('.st-ov:not(.st-ov-ligada)');
      if (ids.length === 1) {
        if (alvo) {
          var i = parseInt(alvo.getAttribute('data-i'), 10);
          est.sel = i; renderOverlays();
          var ov = est.overlays[i];
          gesto = { tipo: 'ov', i: i, ini: pos(e), x0: ov.x, y0: ov.y, rot0: ov.rot, tam0: ov.tam, moveu: 0, t0: Date.now() };
        } else if (!est.ehVideo && !est.textoPuro) {
          gesto = { tipo: 'midia', ini: pos(e), x0: est.midia.x, y0: est.midia.y, s0: est.midia.s, moveu: 0, t0: Date.now() };
          est.sel = -1; renderOverlays();
        } else {
          est.sel = -1; renderOverlays(); gesto = { tipo: 'vazio', ini: pos(e), moveu: 0, t0: Date.now() };
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
        if (ov.tipo === 'texto') sincronizarLigadas(ov);
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
      } else if (gesto.tipo === 'vazio') {
        var p3 = ptrs[e.pointerId];
        gesto.moveu = Math.max(gesto.moveu, Math.abs(p3.x - gesto.ini.x) + Math.abs(p3.y - gesto.ini.y));
      }
    });
    function soltar(e) {
      delete ptrs[e.pointerId];
      if (Object.keys(ptrs).length) return;
      if (gesto && gesto.tipo === 'ov' && est) {
        var i = gesto.i;
        if (gesto.naLixeira) { removerOverlay(i); try { if (navigator.vibrate) navigator.vibrate(20); } catch (x) {} }
        else if (gesto.moveu < 8 && Date.now() - gesto.t0 < 400) {
          var ov = est.overlays[i];
          if (ov && ov.tipo === 'texto') abrirTexto(i, null); // toque no texto edita
        } else { renderOverlays(); }
      } else if (gesto && est && (gesto.tipo === 'midia' || gesto.tipo === 'vazio') && gesto.moveu < 8 && Date.now() - gesto.t0 < 400) {
        abrirTexto(-1, ''); // toque na tela vazia = escrever (como no Instagram)
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

    // ferramentas e painéis
    raiz.addEventListener('click', function (e) {
      var x = e.target.closest('[data-st-x]');
      if (x) { if (est && (est.overlays.length || est.desenhos.length) && !window.confirm('Descartar este story?')) return; fechar(); if (opts && opts.aoCancelar) opts.aoCancelar(); return; }
      var t = e.target.closest('[data-st-tool]');
      if (t) { ferramenta(t.getAttribute('data-st-tool')); return; }
      if (e.target.closest('[data-st-txt-ok]')) { concluirTexto(); return; }
      if (e.target.closest('[data-st-fundo-x]')) { fecharPaineis(); return; }
      if (e.target.closest('[data-st-des-ok]')) { fecharPaineis(); return; }
      if (e.target.closest('[data-st-des-undo]')) { est.desenhos.pop(); redesenhar(); return; }
      var fo = e.target.closest('[data-st-fundo]');
      if (fo) { est.fundo = parseInt(fo.getAttribute('data-st-fundo'), 10) || 0; midiaEl.style.background = cssFundo(est.fundo); raiz.querySelector('.sted-fundo-dot').style.background = cssFundo(est.fundo); return; }
      var fonte = e.target.closest('[data-st-fonte]');
      if (fonte) { est.txtFonte = fonte.getAttribute('data-st-fonte'); aplicarEstiloArea(); focarTexto(); return; }
      var cor = e.target.closest('[data-st-cor]');
      if (cor) {
        if (cor.closest('.sted-des-cores')) { est.desCor = cor.getAttribute('data-st-cor'); marcarCor(); }
        else { est.txtCor = cor.getAttribute('data-st-cor'); aplicarEstiloArea(); focarTexto(); }
        return;
      }
      if (e.target.closest('[data-st-align]')) { est.txtAlinha = est.txtAlinha === 'center' ? 'left' : est.txtAlinha === 'left' ? 'right' : 'center'; aplicarEstiloArea(); focarTexto(); return; }
      if (e.target.closest('[data-st-bg]')) { est.txtFundo = (est.txtFundo + 1) % 3; aplicarEstiloArea(); focarTexto(); return; }
      var menc = e.target.closest('[data-st-menc]');
      if (menc) { escolherMencao({ id: Number(menc.getAttribute('data-id')), usuario: menc.getAttribute('data-st-menc') }); return; }
      if (e.target.closest('.sted-enviar')) { enviar(); return; }
      // toque fora do texto (na área escura) = concluir
      if (!txtPainel.hidden && e.target.closest('[data-st-txt-meio]') && !e.target.closest('.sted-txt-in')) concluirTexto();
    });
    raiz.querySelector('.sted-des-larg').addEventListener('input', function (e) { est.desLarg = parseInt(e.target.value, 10) || 7; });
    txtTam.addEventListener('input', function () { est.txtTam = parseFloat(txtTam.value) || BASE_TAM; aplicarEstiloArea(); });

    // campo de texto (contenteditable)
    txtIn.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); concluirTexto(); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!mencBox.hidden) { var p = mencBox.querySelector('[data-st-menc]'); if (p) { p.click(); return; } }
        document.execCommand('insertLineBreak');
        return;
      }
    });
    txtIn.addEventListener('paste', function (e) {
      e.preventDefault();
      var t = (e.clipboardData || window.clipboardData).getData('text/plain');
      if (t) document.execCommand('insertText', false, t.replace(/\r/g, '').slice(0, MAX_TEXTO));
    });
    txtIn.addEventListener('input', function () {
      var t = textoAtual();
      if (t.length > MAX_TEXTO) { txtIn.innerText = t.slice(0, MAX_TEXTO); caretNoFim(); }
      detectarMencao();
    });
    document.addEventListener('selectionchange', function () { if (!txtPainel.hidden) detectarMencao(); });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', ajustarTeclado);
      window.visualViewport.addEventListener('scroll', ajustarTeclado);
    }

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
    window.addEventListener('resize', function () { if (raiz && !raiz.hidden) { ajustarCanvas(); renderOverlays(); if (!txtPainel.hidden) aplicarEstiloArea(); } });
  }

  function ferramenta(f) {
    if (!est) return;
    var jaAtiva = est.ferramenta === f;
    fecharPaineis();
    if (jaAtiva) return;
    if (f === 'texto') { abrirTexto(-1, ''); return; }
    if (f === 'mencao') { abrirTexto(-1, '@'); return; } // "@" já abre a lista de perfis
    if (f === 'fundo') { fundoPainel.hidden = false; }
    if (f === 'desenho') { desBarra.hidden = false; raiz.classList.add('desenhando'); marcarCor(); }
    est.ferramenta = f;
    var b = raiz.querySelector('[data-st-tool="' + f + '"]'); if (b) b.classList.add('ativo');
  }
  function marcarCor() {
    raiz.querySelectorAll('.sted-des-cores .sted-cor').forEach(function (c) { c.classList.toggle('sel', c.getAttribute('data-st-cor') === est.desCor); });
    raiz.querySelectorAll('.sted-txt .sted-cor').forEach(function (c) { c.classList.toggle('sel', c.getAttribute('data-st-cor') === est.txtCor); });
  }

  /* ---------- Texto ---------- */
  // Lê o texto sem o text-transform da fonte (innerText devolveria MAIÚSCULAS no Forte/Moderno)
  function textoDeNo(no) {
    var d = document.createElement('div'); d.appendChild(no.cloneNode(true));
    d.querySelectorAll('br').forEach(function (b) { b.replaceWith(String.fromCharCode(10)); });
    d.querySelectorAll('div, p').forEach(function (b) { b.insertAdjacentText('beforebegin', String.fromCharCode(10)); });
    return (d.textContent || '').replace(new RegExp(String.fromCharCode(160), 'g'), ' ').replace(new RegExp(String.fromCharCode(13), 'g'), '');
  }
  function textoAtual() { return textoDeNo(txtIn); }
  function caretNoFim() {
    try {
      var r = document.createRange(); r.selectNodeContents(txtIn); r.collapse(false);
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    } catch (e) {}
  }
  function focarTexto() { if (!txtPainel.hidden) { txtIn.focus(); } }
  function abrirTexto(i, inicial) {
    est.txtEditando = i;
    est.txtMencoes = {};
    var ov = i >= 0 ? est.overlays[i] : null;
    if (ov) {
      est.txtCor = ov.cor; est.txtFonte = ov.fonte; est.txtFundo = modoFundo(ov.fundo); est.txtAlinha = ov.alinhamento; est.txtTam = ov.tam;
      txtIn.innerText = ov.texto;
      // menções já ligadas a este texto continuam valendo
      est.overlays.forEach(function (o) { if (o.tipo === 'mencao' && o.oculta && o.ligado === ov.id) est.txtMencoes[o.usuario] = { id: o.id_usuario, usuario: o.usuario }; });
    } else {
      est.txtTam = BASE_TAM;
      txtIn.innerText = inicial || '';
    }
    txtPainel.hidden = false;
    raiz.classList.add('editando-texto');
    renderOverlays();
    aplicarEstiloArea();
    ajustarTeclado();
    setTimeout(function () { txtIn.focus(); caretNoFim(); detectarMencao(); }, 30);
  }
  function fecharTexto() {
    txtPainel.hidden = true; raiz.classList.remove('editando-texto');
    mencBox.hidden = true; mencBox.innerHTML = '';
    txtPainel.style.height = ''; txtPainel.style.top = '';
    try { txtIn.blur(); } catch (e) {}
    est.txtEditando = -1;
  }
  // Teclado do celular: a ferramenta acompanha a área visível (barras ficam acima do teclado)
  function ajustarTeclado() {
    if (!txtPainel || txtPainel.hidden || !window.visualViewport) return;
    var vv = window.visualViewport;
    var r = raiz.getBoundingClientRect();
    txtPainel.style.top = Math.max(0, vv.offsetTop - r.top) + 'px';
    txtPainel.style.height = vv.height + 'px';
  }
  var ICONE_ALINHA = {
    left: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/></svg>',
    center: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="5" y1="18" x2="19" y2="18"/></svg>',
    right: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="6" y1="18" x2="20" y2="18"/></svg>',
  };
  function aplicarEstiloArea() {
    var f = FONTES[est.txtFonte] || FONTES.classico;
    var modo = est.txtFundo, c = coresTexto(est.txtCor, modo);
    var r = palco.getBoundingClientRect();
    aplicarFonte(txtIn, f);
    txtWrap.style.fontSize = (est.txtTam * r.width) + 'px';
    txtWrap.style.maxWidth = Math.round(r.width * 0.86) + 'px';
    txtWrap.style.textAlign = est.txtAlinha;
    txtIn.style.setProperty('--ov-fundo', c.bg);
    txtIn.style.setProperty('--ov-cor', c.cor);
    txtIn.style.textShadow = sombraTexto(f, est.txtCor, modo);
    txtTam.value = est.txtTam;
    raiz.querySelectorAll('.sted-fonte').forEach(function (b) {
      var on = b.getAttribute('data-st-fonte') === est.txtFonte;
      b.classList.toggle('sel', on);
      if (on && b.scrollIntoView) { try { b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); } catch (e) {} }
    });
    var bg = raiz.querySelector('[data-st-bg]');
    bg.classList.remove('modo-1', 'modo-2'); if (modo) bg.classList.add('modo-' + modo);
    raiz.querySelector('[data-st-align]').innerHTML = ICONE_ALINHA[est.txtAlinha] || ICONE_ALINHA.center;
    marcarCor();
  }
  function concluirTexto() {
    var texto = textoAtual().replace(/\s+$/, '').replace(/^\n+/, '');
    var i = est.txtEditando;
    fecharTexto();
    if (!texto.trim()) {
      if (i >= 0) removerOverlay(i);
      renderOverlays();
      return;
    }
    // menções escolhidas que continuam no texto
    var ids = [];
    Object.keys(est.txtMencoes).forEach(function (u) { if (new RegExp('(^|[^a-z0-9._])@' + u.replace(/\./g, '\\.') + '(?![a-z0-9._])', 'i').test(texto)) ids.push(est.txtMencoes[u]); });
    var ov;
    if (i >= 0) {
      ov = est.overlays[i];
      ov.texto = texto; ov.cor = est.txtCor; ov.fonte = est.txtFonte; ov.fundo = est.txtFundo; ov.alinhamento = est.txtAlinha; ov.tam = est.txtTam;
      est.overlays = est.overlays.filter(function (o) { return !(o.tipo === 'mencao' && o.oculta && o.ligado === ov.id); });
      est.sel = est.overlays.indexOf(ov);
    } else {
      ov = addOverlay({ tipo: 'texto', texto: texto, cor: est.txtCor, fonte: est.txtFonte, fundo: est.txtFundo, alinhamento: est.txtAlinha, x: 0.5, y: 0.45, rot: 0, tam: est.txtTam });
    }
    // @ dentro do texto: menção invisível por cima (clicável no visualizador, marca a pessoa)
    ids.forEach(function (m) {
      est.overlays.push({ id: ++seqOv, tipo: 'mencao', oculta: true, ligado: ov.id, id_usuario: m.id, usuario: m.usuario, texto: '@' + m.usuario, x: ov.x, y: ov.y, rot: ov.rot, tam: ov.tam });
    });
    renderOverlays();
  }

  /* ---------- "@" no texto: lista de perfis ---------- */
  function textoAntesDoCursor() {
    var s = window.getSelection();
    if (!s || !s.rangeCount) return textoAtual();
    var r = s.getRangeAt(0);
    if (!txtIn.contains(r.startContainer)) return textoAtual();
    var pre = r.cloneRange(); pre.selectNodeContents(txtIn); pre.setEnd(r.startContainer, r.startOffset);
    var frag = document.createElement('div'); frag.appendChild(pre.cloneContents());
    return textoDeNo(frag);
  }
  function detectarMencao() {
    if (txtPainel.hidden) return;
    var antes = textoAntesDoCursor();
    var m = /(^|\s)@([a-z0-9._]{0,30})$/i.exec(antes);
    if (!m) { mencBox.hidden = true; mencBox.innerHTML = ''; return; }
    var q = m[2];
    clearTimeout(mencTimer);
    mencTimer = setTimeout(function () {
      var minha = ++mencSeq;
      fetch('/mencoes?q=' + encodeURIComponent(q), { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (lista) {
          if (minha !== mencSeq || txtPainel.hidden) return;
          mencBox.innerHTML = (lista || []).slice(0, 8).map(function (p) {
            var av = p.foto_perfil ? '<img src="' + esc(p.foto_perfil) + '" alt="">' : esc((p.nome || '?').trim().charAt(0).toUpperCase());
            return '<button type="button" class="sted-menc" data-st-menc="' + esc(p.usuario) + '" data-id="' + esc(String(p.id_usuario || '')) + '">'
              + '<span class="sted-menc-av">' + av + '</span><span class="sted-menc-txt"><strong>' + esc(p.nome) + '</strong><small>@' + esc(p.usuario) + '</small></span></button>';
          }).join('');
          mencBox.hidden = !mencBox.innerHTML;
        }).catch(function () {});
    }, 120);
  }
  function escolherMencao(p) {
    if (!p || !p.usuario) return;
    var antes = textoAntesDoCursor();
    var m = /(^|\s)@([a-z0-9._]{0,30})$/i.exec(antes);
    var tokenLen = m ? ('@' + m[2]).length : 0;
    var textoTodo = textoAtual();
    var resto = textoTodo.slice(antes.length);
    var semToken = (antes.slice(0, antes.length - tokenLen) + resto).trim();
    mencBox.hidden = true; mencBox.innerHTML = '';
    if (!semToken) {
      // só a menção: vira figurinha de @ (a pessoa arrasta para onde quiser)
      var i = est.txtEditando;
      fecharTexto();
      if (i >= 0) removerOverlay(i);
      if (!est.overlays.some(function (o) { return o.tipo === 'mencao' && !o.oculta && o.id_usuario === p.id; })) {
        addOverlay({ tipo: 'mencao', id_usuario: p.id, usuario: p.usuario, texto: '@' + p.usuario, x: 0.5, y: 0.5, rot: 0, tam: 0.07 });
      }
      renderOverlays();
      try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {}
      return;
    }
    // menção no meio do texto: troca o que foi digitado por @usuario
    txtIn.focus();
    var s = window.getSelection();
    if (s && s.modify) { for (var k = 0; k < tokenLen; k++) s.modify('extend', 'backward', 'character'); }
    document.execCommand('insertText', false, '@' + p.usuario + ' ');
    est.txtMencoes[p.usuario] = { id: p.id, usuario: p.usuario };
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

  /* ---------- Renderização final (foto / texto) — igual ao que se vê na tela ---------- */
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
    if (ov.tipo === 'mencao' && ov.oculta) return; // menção dentro do texto: só clicável, nada a desenhar
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
      ctx.font = '700 ' + tam + 'px ' + SANS;
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
      ctx.font = fonteCss(f) + tam + 'px ' + f.familia;
      ctx.textBaseline = 'middle';
      if (f.espaco && ctx.letterSpacing !== undefined) ctx.letterSpacing = (f.espaco * tam) + 'px';
      var padX = tam * 0.36, lh = tam * 1.25, raio = tam * 0.3;
      var linhas = quebrarLinhas(ctx, texto, pw * 0.86 - padX * 2);
      var larguras = linhas.map(function (l) { return ctx.measureText(l).width; });
      var maxL = Math.max.apply(null, larguras.concat([0]));
      var alinha = ov.alinhamento;
      ctx.textAlign = alinha;
      var x0 = alinha === 'left' ? -maxL / 2 : alinha === 'right' ? maxL / 2 : 0;
      var yIni = -((linhas.length - 1) * lh) / 2;
      var modo = modoFundo(ov.fundo), c = coresTexto(ov.cor, modo);
      if (modo) {
        ctx.fillStyle = c.bg;
        linhas.forEach(function (l, i) {
          var lw = larguras[i] + padX * 2;
          var lx = alinha === 'left' ? -maxL / 2 - padX : alinha === 'right' ? maxL / 2 + padX - lw : -lw / 2;
          arredondado(ctx, lx, yIni + i * lh - lh / 2, lw, lh, raio); ctx.fill();
        });
      } else if (f.brilho) { ctx.shadowColor = ov.cor; ctx.shadowBlur = tam * 0.55; }
      else { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = tam * 0.12; ctx.shadowOffsetY = tam * 0.04; }
      ctx.fillStyle = c.cor;
      linhas.forEach(function (l, i) { ctx.fillText(l, x0, yIni + i * lh + tam * 0.04); });
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
        if (ov.tipo === 'texto') { o.cor = ov.cor; o.fundo = modoFundo(ov.fundo); o.fonte = ov.fonte; o.alinhamento = ov.alinhamento; }
        if (ov.tipo === 'mencao') { o.id_usuario = ov.id_usuario; o.usuario = ov.usuario; if (ov.oculta) o.oculta = true; }
        return o;
      });
  }
  function enviar() {
    if (!est || !opts || !opts.enviar) return;
    if (!txtPainel.hidden) concluirTexto();
    if (est.textoPuro && !est.overlays.length && !est.desenhos.length) { toastLocal('Escreva alguma coisa no seu story.'); abrirTexto(-1, ''); return; }
    enviarBtn.disabled = true; enviarBtn.textContent = 'Preparando…';
    var mencoes = [];
    est.overlays.forEach(function (o) { if (o.tipo === 'mencao' && o.id_usuario && mencoes.indexOf(o.id_usuario) < 0) mencoes.push(o.id_usuario); });
    var fim = function (arquivo, meta) {
      var p = opts.enviar(arquivo, meta);
      Promise.resolve(p).then(function () { fechar(); }).catch(function () { enviarBtn.disabled = false; enviarBtn.textContent = 'Compartilhar no story'; });
    };
    if (est.ehVideo) {
      fim(est.file, { ehVideo: true, sobreposicoes: sobreposicoesJson(false), mencoes: mencoes });
    } else {
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
      var div = el('div', 'st-ov st-ov-' + ov.tipo + (soMencoes || ov.oculta ? ' st-ov-oculta' : ''));
      if (ov.tipo === 'mencao') { div.innerHTML = '<a class="st-ov-inner" href="/u/' + encodeURIComponent(ov.usuario) + '">@' + esc(ov.usuario) + '</a>'; }
      else div.innerHTML = '<span class="st-ov-inner">' + esc(ov.texto).replace(/\n/g, '<br>') + '</span>';
      var p0 = palco; palco = fake; // estiloOverlay usa a largura do palco
      try { estiloOverlay(div, Object.assign({ fonte: 'classico', cor: '#fff', alinhamento: 'center' }, ov)); } finally { palco = p0; }
      container.appendChild(div);
    });
  }

  window.AnjoStoryEditor = { abrir: abrir, fechar: fechar, renderEm: renderEm, FONTES: FONTES };
})();
