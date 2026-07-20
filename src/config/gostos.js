'use strict';

/**
 * Rótulos + emojis das preferências ("gostos") do usuário.
 * Usado no perfil (aba Gostos) e no modal de aniversário (ideias de presente).
 */
const CAMPOS = [
  { campo: 'lanche_favorito', rotulo: 'Lanche favorito', emoji: '🍔' },
  { campo: 'bebida_favorita', rotulo: 'Bebida favorita', emoji: '🥤' },
  { campo: 'chocolate_favorito', rotulo: 'Chocolate favorito', emoji: '🍫' },
  { campo: 'coisas_que_gosta', rotulo: 'Curte', emoji: '💛' },
  { campo: 'hobbies', rotulo: 'Hobbies', emoji: '🎨' },
  { campo: 'coisas_que_nao_gosta', rotulo: 'Não curte', emoji: '🚫' },
  { campo: 'restricoes_alimentares', rotulo: 'Restrições alimentares', emoji: '🥗' },
  { campo: 'observacoes', rotulo: 'Recadinho', emoji: '📝' },
];

// Chaves recomendadas para "ideias de presente" (aniversário).
const PRESENTE = ['lanche_favorito', 'bebida_favorita', 'chocolate_favorito', 'coisas_que_gosta', 'hobbies'];

/**
 * Monta a lista de gostos preenchidos.
 * @param prefs objeto de preferências (ou null)
 * @param apenas array opcional de chaves para filtrar (ex.: PRESENTE)
 */
function montarGostos(prefs, apenas) {
  if (!prefs) return [];
  const campos = apenas ? CAMPOS.filter((c) => apenas.includes(c.campo)) : CAMPOS;
  const out = [];
  for (const c of campos) {
    const v = prefs[c.campo];
    if (v && String(v).trim()) out.push({ rotulo: c.rotulo, emoji: c.emoji, valor: String(v).trim() });
  }
  return out;
}

module.exports = { CAMPOS, PRESENTE, montarGostos };
