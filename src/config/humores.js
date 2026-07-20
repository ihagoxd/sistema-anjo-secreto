'use strict';

/**
 * Lista de "status do dia" (humor) que o usuário pode definir no seu story.
 * Cada item: { chave, emoji, rotulo }. A chave é o que fica salvo no banco.
 */
const HUMORES = [
  { chave: 'feliz',      emoji: '😄', rotulo: 'Feliz' },
  { chave: 'apaixonado', emoji: '😍', rotulo: 'Apaixonado' },
  { chave: 'deboa',      emoji: '😎', rotulo: 'De boa' },
  { chave: 'animado',    emoji: '🥳', rotulo: 'Animado' },
  { chave: 'focado',     emoji: '🎯', rotulo: 'Focado' },
  { chave: 'estudando',  emoji: '📚', rotulo: 'Estudando' },
  { chave: 'trabalhando',emoji: '💻', rotulo: 'Trabalhando' },
  { chave: 'motivado',   emoji: '💪', rotulo: 'Motivado' },
  { chave: 'cafeinado',  emoji: '☕', rotulo: 'Cafeinado' },
  { chave: 'fome',       emoji: '🍔', rotulo: 'Com fome' },
  { chave: 'sono',       emoji: '😴', rotulo: 'Com sono' },
  { chave: 'cansado',    emoji: '🥱', rotulo: 'Cansado' },
  { chave: 'estressado', emoji: '😤', rotulo: 'Estressado' },
  { chave: 'triste',     emoji: '😢', rotulo: 'Triste' },
  { chave: 'ansioso',    emoji: '😰', rotulo: 'Ansioso' },
  { chave: 'doente',     emoji: '🤒', rotulo: 'Doente' },
  { chave: 'grato',      emoji: '🙏', rotulo: 'Grato' },
  { chave: 'pensativo',  emoji: '🤔', rotulo: 'Pensativo' },
  { chave: 'festa',      emoji: '🎉', rotulo: 'Modo festa' },
  { chave: 'viajando',   emoji: '✈️', rotulo: 'Viajando' },
];

const POR_CHAVE = Object.fromEntries(HUMORES.map((h) => [h.chave, h]));

function ehValido(chave) {
  return Object.prototype.hasOwnProperty.call(POR_CHAVE, chave);
}

function emojiDe(chave) {
  return POR_CHAVE[chave] ? POR_CHAVE[chave].emoji : '';
}

function rotuloDe(chave) {
  return POR_CHAVE[chave] ? POR_CHAVE[chave].rotulo : '';
}

module.exports = { HUMORES, POR_CHAVE, ehValido, emojiDe, rotuloDe };
