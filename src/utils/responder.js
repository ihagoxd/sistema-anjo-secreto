'use strict';

// Ações do painel do admin. Vindas por fetch (tela fluida), respondem JSON e a página se
// atualiza sem recarregar. Num envio normal de formulário (sem JS), guardam o aviso (flash)
// e redirecionam como sempre.
function ehFetch(req) {
  return (req.get('x-requested-with') || '') === 'fetch';
}

// ok/msg/erro: resultado da ação. destino: para onde volta sem JS. dados: campos extras do JSON.
// flash: texto mais longo para a tela sem JS (por padrão, o próprio msg/erro).
function responder(req, res, { ok = true, msg, erro, destino, dados, flash } = {}) {
  if (ehFetch(req)) {
    const corpo = ok ? { ok: true, msg } : { ok: false, erro };
    return res.status(ok ? 200 : 400).json(Object.assign(corpo, dados));
  }
  req.session.flash = ok ? { sucesso: flash || msg } : { erro: flash || erro };
  return res.redirect(destino);
}

// Renderiza uma view/partial sem layout e devolve o HTML (para trocar um pedaço da tela).
function renderizar(res, view, ctx) {
  return new Promise((resolve, reject) => {
    res.render(view, Object.assign({ layout: false }, ctx), (err, html) => (err ? reject(err) : resolve(html)));
  });
}

module.exports = { ehFetch, responder, renderizar };
