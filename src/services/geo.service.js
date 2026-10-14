'use strict';

/**
 * "Usar minha localização" no post: o navegador manda latitude/longitude e o
 * servidor pergunta ao Nominatim (OpenStreetMap) o nome do lugar — bairro e cidade.
 * Volume baixíssimo (escritório), com cache em memória e no máximo 1 pedido por
 * segundo, como pede a política de uso do serviço.
 */
const cache = new Map(); // "lat,lon" arredondado → nome
let ultimo = 0;

function arredondar(n) { return Math.round(Number(n) * 500) / 500; } // ~200 m

async function nomeDoLugar(lat, lon) {
  lat = arredondar(lat); lon = arredondar(lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const chave = `${lat},${lon}`;
  if (cache.has(chave)) return cache.get(chave);

  const espera = Math.max(0, 1100 - (Date.now() - ultimo));
  if (espera) await new Promise((r) => setTimeout(r, espera));
  ultimo = Date.now();

  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&addressdetails=1&accept-language=pt-BR&lat=${lat}&lon=${lon}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'AnjoSecreto/1.0 (app interno; contato: admin@sistemastron.com.br)' }, signal: ctrl.signal });
    if (!r.ok) return null;
    const d = await r.json();
    const a = d.address || {};
    const bairro = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.village || null;
    const cidade = a.city || a.town || a.municipality || a.county || null;
    const partes = [bairro, cidade].filter(Boolean);
    const nome = partes.length ? partes.join(', ') : (d.name || null);
    cache.set(chave, nome);
    return nome;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { nomeDoLugar };
