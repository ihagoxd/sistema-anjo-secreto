'use strict';

/**
 * Temas de CONVERSA do Direct do escritório (como os temas de chat do Instagram):
 * escolhidos dentro da conversa, valem para os DOIS lados daquele par.
 * O canal secreto do Anjo (anjo/protegido) NÃO usa isto — tem o visual próprio.
 * As cores vivem no CSS (estilo.css → "TEMAS DE CONVERSA"); aqui fica só o catálogo
 * e a amostra (gradiente) que aparece na folha de escolha.
 */
const TEMAS_CHAT = [
  { chave: 'padrao', nome: 'Padrão', amostra: 'linear-gradient(135deg, #e3b341, #8b949e)' },
  { chave: 'oceano', nome: 'Oceano', amostra: 'linear-gradient(135deg, #1e90ff, #00c6ff)' },
  { chave: 'amor', nome: 'Amor', amostra: 'linear-gradient(135deg, #ff2d75, #ff6a3d)' },
  { chave: 'por-do-sol', nome: 'Pôr do sol', amostra: 'linear-gradient(135deg, #ff5f6d, #ffc371)' },
  { chave: 'floresta', nome: 'Floresta', amostra: 'linear-gradient(135deg, #2ecc71, #12b886)' },
  { chave: 'lavanda', nome: 'Lavanda', amostra: 'linear-gradient(135deg, #a18cd1, #fbc2eb)' },
  { chave: 'noite', nome: 'Noite', amostra: 'linear-gradient(135deg, #4b6cb7, #182848)' },
  { chave: 'cafe', nome: 'Café', amostra: 'linear-gradient(135deg, #c8a27a, #6b4a2f)' },
  { chave: 'neon', nome: 'Neon', amostra: 'linear-gradient(135deg, #00f5a0, #00d9f5)' },
  { chave: 'dourado', nome: 'Dourado', amostra: 'linear-gradient(135deg, #e3b341, #8a5a00)' },
];

function temaChatValido(chave) {
  return TEMAS_CHAT.some((t) => t.chave === chave);
}

function nomeTemaChat(chave) {
  const t = TEMAS_CHAT.find((x) => x.chave === chave);
  return t ? t.nome : 'Padrão';
}

module.exports = { TEMAS_CHAT, temaChatValido, nomeTemaChat };
