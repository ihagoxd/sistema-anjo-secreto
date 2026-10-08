'use strict';

/**
 * Tema da rede social: qual está ativo (com cache), troca pelo admin e as
 * preferências extras que o tema libera (ex.: presentes do Mês das Crianças).
 */
const configModel = require('../models/config.model');
const preferenciaTemaModel = require('../models/preferenciaTema.model');
const { TEMAS, PADRAO, porChave } = require('../config/temas');

const CHAVE_ATIVO = 'tema_ativo';
const CHAVE_META = 'tema_ativo_meta';
// O tema entra em TODA página: fica em memória e só volta ao banco de tempos em tempos.
const TTL_MS = 10 * 1000;
let cache = { chave: null, meta: null, lidoEm: 0 };

function lerJson(texto) {
  try { return texto ? JSON.parse(texto) : null; } catch (e) { return null; }
}

// Objeto do tema pronto para as views (res.locals.tema).
function montar(chave, meta) {
  const t = porChave(chave) || PADRAO;
  return {
    ...t,
    temPrefs: !!t.prefs,
    ehPadrao: t.chave === PADRAO.chave,
    ativadoEm: meta && meta.em ? meta.em : null,
    ativadoPor: meta && meta.por ? meta.por : null,
  };
}

function padrao() {
  return montar(PADRAO.chave, null);
}

async function ativo() {
  if (!cache.chave || Date.now() - cache.lidoEm > TTL_MS) {
    const [chave, meta] = await Promise.all([configModel.ler(CHAVE_ATIVO), configModel.ler(CHAVE_META)]);
    cache = { chave: porChave(chave) ? chave : PADRAO.chave, meta: lerJson(meta), lidoEm: Date.now() };
  }
  return montar(cache.chave, cache.meta);
}

function invalidarCache() {
  cache.lidoEm = 0;
}

// Troca o tema para todo mundo. `por` = nome de quem ativou (vai para o painel).
async function definir(chave, por) {
  const novo = porChave(chave);
  if (!novo) return { ok: false, motivo: 'TEMA_INVALIDO' };
  const atual = await ativo();
  if (atual.chave === novo.chave) return { ok: true, mudou: false, tema: montar(novo.chave, cache.meta), anterior: atual };
  await configModel.gravar(CHAVE_ATIVO, novo.chave);
  await configModel.gravar(CHAVE_META, JSON.stringify({ em: new Date().toISOString(), por: por || null }));
  invalidarCache();
  return { ok: true, mudou: true, tema: await ativo(), anterior: atual };
}

// Lista para o admin, marcando qual está em uso.
async function listarParaAdmin() {
  const atual = await ativo();
  return TEMAS.map((t) => ({ ...t, temPrefs: !!t.prefs, ativo: t.chave === atual.chave }));
}

// ---------- Preferências extras do tema ----------

// Limpa o que veio do formulário conforme os campos do tema (nada fora deles entra).
function limparDados(tema, body) {
  const out = {};
  if (!tema || !tema.prefs) return out;
  for (const c of tema.prefs.campos) {
    const bruto = body ? body[c.campo] : null;
    if (c.tipo === 'lista') {
      let arr = [];
      if (Array.isArray(bruto)) arr = bruto;
      else if (typeof bruto === 'string' && bruto.trim()) {
        const j = lerJson(bruto);
        arr = Array.isArray(j) ? j : bruto.split(/[\n,]/);
      }
      const vistos = new Set();
      arr = arr
        .map((s) => String(s == null ? '' : s).trim().replace(/\s+/g, ' ').slice(0, 60))
        .filter((s) => {
          if (!s) return false;
          const k = s.toLowerCase();
          if (vistos.has(k)) return false;
          vistos.add(k);
          return true;
        })
        .slice(0, c.max || 12);
      if (arr.length) out[c.campo] = arr;
    } else {
      const v = String(bruto == null ? '' : bruto).trim().slice(0, c.tipo === 'textarea' ? 500 : 150);
      if (v) out[c.campo] = v;
    }
  }
  return out;
}

async function buscarDados(idUsuario, tema) {
  if (!tema || !tema.prefs) return {};
  const row = await preferenciaTemaModel.buscar(idUsuario, tema.chave);
  return row && row.dados && typeof row.dados === 'object' ? row.dados : {};
}

async function salvarDados(idUsuario, tema, body) {
  if (!tema || !tema.prefs) return { ok: false, motivo: 'SEM_PREFS' };
  const dados = limparDados(tema, body);
  await preferenciaTemaModel.salvar(idUsuario, tema.chave, dados);
  return { ok: true, dados, vazio: Object.keys(dados).length === 0 };
}

// A pessoa já contou alguma coisa neste tema?
async function preencheu(idUsuario, tema) {
  const dados = await buscarDados(idUsuario, tema);
  return Object.keys(dados).length > 0;
}

// Lista pronta para exibir (página do protegido, perfil): só o que foi preenchido.
function montarGostos(tema, dados) {
  if (!tema || !tema.prefs || !dados) return [];
  const out = [];
  for (const c of tema.prefs.campos) {
    const v = dados[c.campo];
    if (c.tipo === 'lista') {
      if (Array.isArray(v) && v.length) out.push({ campo: c.campo, rotulo: c.rotulo, emoji: c.emoji, lista: v });
    } else if (v && String(v).trim()) {
      out.push({ campo: c.campo, rotulo: c.rotulo, emoji: c.emoji, valor: String(v).trim() });
    }
  }
  return out;
}

// Gostos do tema de um usuário, já montados (atalho usado pelo anjo e pelo perfil).
async function gostosDe(idUsuario, tema) {
  if (!tema || !tema.prefs) return [];
  return montarGostos(tema, await buscarDados(idUsuario, tema));
}

function contarPreenchidos(tema) {
  if (!tema || !tema.prefs) return Promise.resolve(0);
  return preferenciaTemaModel.contarPreenchidos(tema.chave);
}

module.exports = {
  ativo, padrao, definir, invalidarCache, listarParaAdmin,
  limparDados, buscarDados, salvarDados, preencheu, montarGostos, gostosDe, contarPreenchidos,
};
