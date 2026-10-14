'use strict';

/**
 * Renderiza um partial do Handlebars FORA de uma requisição (sem layout).
 * Usado para mandar HTML pronto por SSE/AJAX: bolha do Direct, card de post…
 * O mesmo partial que a página usa — nada de duplicar template no JS.
 */
const path = require('path');
const { exphbs, viewsDir } = require('../config/handlebars');

function partial(nome, contexto) {
  return exphbs.render(path.join(viewsDir, 'partials', `${nome}.handlebars`), contexto || {});
}

function view(nome, contexto) {
  return exphbs.render(path.join(viewsDir, `${nome}.handlebars`), contexto || {});
}

module.exports = { partial, view };
