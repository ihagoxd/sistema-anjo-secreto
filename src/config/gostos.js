'use strict';

/**
 * Rótulos + emojis das preferências ("gostos") do usuário.
 * Usado no perfil (aba Gostos) e no modal de aniversário (ideias de presente).
 */
const CAMPOS = [
  { campo: 'lanche_favorito', rotulo: 'Lanche favorito', emoji: '🍔', icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11h18"/><path d="M4 11a8 8 0 0 1 16 0"/><path d="M5 15h14l-1 4H6z"/></svg>' },
  { campo: 'bebida_favorita', rotulo: 'Bebida favorita', emoji: '🥤', icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l-1.5 13h-9z"/><path d="M5 8h14"/><path d="M13 8l2-6h3"/></svg>' },
  { campo: 'chocolate_favorito', rotulo: 'Chocolate favorito', emoji: '🍫', icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="5" y1="9" x2="19" y2="9"/><line x1="5" y1="15" x2="19" y2="15"/></svg>' },
  { campo: 'coisas_que_gosta', rotulo: 'Curte', emoji: '💛', icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>' },
  { campo: 'hobbies', rotulo: 'Hobbies', emoji: '🎨', icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="12" rx="4"/><line x1="7" y1="11" x2="7" y2="15"/><line x1="5" y1="13" x2="9" y2="13"/><circle cx="15.5" cy="12" r="1"/><circle cx="18" cy="14.5" r="1"/></svg>' },
  { campo: 'coisas_que_nao_gosta', rotulo: 'Não curte', emoji: '🚫', icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>' },
  { campo: 'restricoes_alimentares', rotulo: 'Restrições alimentares', emoji: '🥗', icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' },
  { campo: 'observacoes', rotulo: 'Recadinho', emoji: '📝', icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>' },
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
    if (v && String(v).trim()) out.push({ rotulo: c.rotulo, emoji: c.emoji, icone: c.icone, valor: String(v).trim() });
  }
  return out;
}

module.exports = { CAMPOS, PRESENTE, montarGostos };
