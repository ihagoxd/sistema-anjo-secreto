'use strict';

/**
 * Utilitário de @menções.
 * Username: letras/números/_ com segmentos separados por ponto (ex.: andre.rocha).
 * A menção precisa vir no início ou após espaço/pontuação (não pega e-mails).
 */
const PADRAO = '(^|[\\s(.,!?:;\\n])@([a-z0-9_]+(?:\\.[a-z0-9_]+)*)';

function novaRegex() {
  return new RegExp(PADRAO, 'gi');
}

// Lista de usernames (minúsculos, sem repetir) mencionados no texto.
function extrair(texto) {
  const re = novaRegex();
  const out = new Set();
  let m;
  while ((m = re.exec(String(texto || ''))) !== null) {
    out.add(m[2].toLowerCase());
  }
  return [...out];
}

module.exports = { PADRAO, novaRegex, extrair };
