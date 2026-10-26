'use strict';

/**
 * Regras dos Stories (estilo Instagram): publicar foto/vídeo que expira em 24 h,
 * listar agrupado por pessoa, marcar visto e limpar expirados (banco + disco).
 */
const fs = require('fs');
const path = require('path');
const storyModel = require('../models/story.model');
const videoService = require('./video.service');
const usuarioModel = require('../models/usuario.model');
const dmService = require('./mensagemDireta.service');
const { apagarUpload, UPLOAD_DIR } = require('../config/upload');

// Tira do banco e do disco os stories com mais de 24 h (chamado nas listagens).
async function limparExpirados() {
  const mortos = await storyModel.removerExpirados();
  mortos.forEach((m) => { apagarUpload(m.imagem); apagarUpload(m.video); });
}

// Sobreposições do editor (texto/figurinha/menção) — só o que é válido entra, com limites.
const FONTES = ['classico', 'moderno', 'forte', 'elegante', 'maquina', 'neon'];
const ALINHAMENTOS = ['center', 'left', 'right'];
function limparSobreposicoes(bruto) {
  let lista = bruto;
  if (typeof bruto === 'string') { try { lista = JSON.parse(bruto); } catch (e) { return null; } }
  if (!Array.isArray(lista)) return null;
  const num = (v, min, max, padrao) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao; };
  const out = [];
  for (const o of lista.slice(0, 30)) {
    if (!o || typeof o !== 'object') continue;
    const tipo = ['texto', 'emoji', 'mencao'].includes(o.tipo) ? o.tipo : null;
    if (!tipo) continue;
    const item = {
      tipo,
      x: num(o.x, 0, 1, 0.5), y: num(o.y, 0, 1, 0.5),
      rot: num(o.rot, -360, 360, 0), tam: num(o.tam, 0.02, 0.6, 0.1),
      texto: String(o.texto || '').slice(0, 300),
    };
    if (tipo === 'texto') {
      item.cor = /^#[0-9a-f]{6}$/i.test(String(o.cor)) ? String(o.cor) : '#ffffff';
      item.fundo = o.fundo === true ? 1 : ([1, 2].includes(Number(o.fundo)) ? Number(o.fundo) : 0); // 0 nenhum · 1 sólido · 2 translúcido
      item.fonte = FONTES.includes(o.fonte) ? o.fonte : 'classico';
      item.alinhamento = ALINHAMENTOS.includes(o.alinhamento) ? o.alinhamento : 'center';
    }
    if (tipo === 'mencao') {
      item.id_usuario = Number(o.id_usuario) || null;
      item.usuario = String(o.usuario || '').replace(/[^a-z0-9._]/gi, '').slice(0, 40);
      if (o.oculta) item.oculta = true; // "@" dentro de um texto: só a área clicável
      if (!item.id_usuario || !item.usuario) continue;
    }
    if (tipo !== 'mencao' && !item.texto) continue;
    out.push(item);
  }
  return out.length ? out : null;
}

async function publicar(idUsuario, imagem, video, mencaoIds = null, sobreposicoesBrutas = null) {
  if (!imagem && !video) return { ok: false, motivo: 'VAZIO' };
  const sobreposicoes = limparSobreposicoes(sobreposicoesBrutas);

  // Menções (pode marcar VÁRIAS pessoas): valida cada uma; inválidas são ignoradas.
  const marcados = [];
  for (const bruto of String(mencaoIds || '').split(',')) {
    const mid = Number(bruto.trim());
    if (!mid || mid === Number(idUsuario) || marcados.includes(mid)) continue;
    const m = await usuarioModel.buscarPorId(mid);
    if (m && m.status === 'APROVADO' && m.ativo && m.tipo_usuario === 'PARTICIPANTE') marcados.push(m.id_usuario);
  }

  // Menção colocada como figurinha no editor também conta como pessoa marcada
  if (sobreposicoes) {
    for (const o of sobreposicoes) {
      if (o.tipo !== 'mencao' || marcados.includes(o.id_usuario) || o.id_usuario === Number(idUsuario)) continue;
      const m = await usuarioModel.buscarPorId(o.id_usuario);
      if (m && m.status === 'APROVADO' && m.ativo && m.tipo_usuario === 'PARTICIPANTE') marcados.push(m.id_usuario);
    }
  }
  const id = await storyModel.criar(idUsuario, imagem, video, marcados[0] || null, sobreposicoes);
  if (video) videoService.processar(video, async (r) => { await storyModel.atualizarVideo(id.id_story, r.video); });
  for (const mid of marcados) await enviarCardDeMencao(id, idUsuario, mid, imagem, video);
  return { ok: true, id_story: id };
}

// Registra a menção e manda no DIRECT do marcado o card do story com o botão
// "Repostar esse story" (a mídia é copiada pro card não quebrar quando expirar).
async function enviarCardDeMencao(idStory, idAutor, idMarcado, imagem, video) {
  try {
    await storyModel.adicionarMencao(idStory, idMarcado);
    const origem = imagem || video;
    const ext = path.extname(path.basename(origem));
    const copia = `mnc-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    await fs.promises.copyFile(path.join(UPLOAD_DIR, path.basename(origem)), path.join(UPLOAD_DIR, copia));
    const caminho = `/uploads/${copia}`;
    const r = await dmService.enviar(idAutor, idMarcado, null, imagem ? caminho : null, null, video ? caminho : null,
      { ref: idStory, autor: idAutor, tipo: 'mencao' });
    if (!r.ok) apagarUpload(caminho);
    return r;
  } catch (e) { return { ok: false }; } // menção sem DM não derruba a publicação
}

// Marcar alguém num story JÁ publicado (ícone @ no visualizador do próprio story).
async function marcarPessoa(meId, idStory, pessoaId) {
  const s = await storyModel.buscarPorId(idStory);
  if (!s) return { ok: false, motivo: 'NAO_ENCONTRADO' };
  if (Number(s.id_usuario) !== Number(meId)) return { ok: false, motivo: 'SEM_PERMISSAO' };
  if (Date.now() - new Date(s.criado_em).getTime() > 24 * 3600 * 1000) return { ok: false, motivo: 'EXPIRADO' };
  if (Number(pessoaId) === Number(meId)) return { ok: false, motivo: 'PESSOA_INVALIDA' };
  const p = await usuarioModel.buscarPorId(Number(pessoaId));
  if (!p || p.status !== 'APROVADO' || !p.ativo || p.tipo_usuario !== 'PARTICIPANTE') return { ok: false, motivo: 'PESSOA_INVALIDA' };
  const r = await enviarCardDeMencao(s.id_story, meId, p.id_usuario, s.imagem, s.video);
  return r.ok ? { ok: true, usuario: p.usuario } : { ok: false, motivo: 'FALHA' };
}

// Repostar um story em que EU fui marcado (vídeo: cópia direta; foto o front
// compõe no fundo dourado da marca e publica como imagem nova).
async function repostar(meId, idStory) {
  const s = await storyModel.buscarPorId(idStory);
  if (!s) return { ok: false, motivo: 'NAO_ENCONTRADO' };
  if (!(await storyModel.foiMencionado(idStory, meId))) return { ok: false, motivo: 'SEM_PERMISSAO' };
  const origem = s.imagem || s.video;
  if (!origem) return { ok: false, motivo: 'SEM_MIDIA' };
  const ext = path.extname(path.basename(origem));
  const copia = `rps-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  await fs.promises.copyFile(path.join(UPLOAD_DIR, path.basename(origem)), path.join(UPLOAD_DIR, copia));
  const caminho = `/uploads/${copia}`;
  const id = await storyModel.criar(meId, s.imagem ? caminho : null, s.video ? caminho : null, null);
  return { ok: true, id_story: id };
}

// Stories ativos agrupados por pessoa, o MEU grupo primeiro (como no Instagram);
// os demais: quem tem story não visto vem antes, depois por story mais recente.
async function listarAgrupado(meId) {
  await limparExpirados();
  const linhas = await storyModel.listarAtivos(meId);
  const porUser = new Map();
  linhas.forEach((s) => {
    if (!porUser.has(s.id_usuario)) {
      porUser.set(s.id_usuario, {
        id_usuario: s.id_usuario, nome: s.nome, usuario: s.usuario, foto_perfil: s.foto_perfil,
        eu: s.id_usuario === meId, tudoVisto: true, itens: [],
      });
    }
    const g = porUser.get(s.id_usuario);
    g.itens.push({
      id_story: s.id_story, imagem: s.imagem, video: s.video,
      criado_em: s.criado_em, visto: s.visto, vistos: s.vistos,
      curti: s.curti, curtidas: s.curtidas,
      sobreposicoes: s.sobreposicoes || null,
    });
    if (!s.visto) g.tudoVisto = false;
  });
  const grupos = Array.from(porUser.values());
  grupos.sort((a, b) => {
    if (a.eu !== b.eu) return a.eu ? -1 : 1;
    if (a.tudoVisto !== b.tudoVisto) return a.tudoVisto ? 1 : -1;
    const at = new Date(a.itens[a.itens.length - 1].criado_em).getTime();
    const bt = new Date(b.itens[b.itens.length - 1].criado_em).getTime();
    return bt - at;
  });
  return grupos;
}

// Resumo por usuário para os anéis do feed (dourado / cinza).
async function resumoAneis(meId) {
  await limparExpirados();
  return storyModel.resumoAneis(meId);
}

async function marcarVisto(meId, idStory) {
  const s = await storyModel.buscarPorId(idStory);
  if (!s) return { ok: false };
  if (s.id_usuario !== meId) await storyModel.marcarVisto(idStory, meId);
  return { ok: true };
}

// Lista de quem viu (só o AUTOR do story — ou admin — pode ver).
async function vistosDe(meId, idStory, ehAdmin) {
  const s = await storyModel.buscarPorId(idStory);
  if (!s) return null;
  if (s.id_usuario !== meId && !ehAdmin) return null;
  return storyModel.listarViram(idStory);
}

// Curtir/descurtir o story (coração do visualizador).
async function alternarCurtida(meId, idStory) {
  const s = await storyModel.buscarPorId(idStory);
  if (!s) return { ok: false };
  const ja = await storyModel.jaCurtiu(idStory, meId);
  if (ja) await storyModel.descurtir(idStory, meId);
  else await storyModel.curtir(idStory, meId);
  return { ok: true, curti: !ja, total: await storyModel.contarCurtidas(idStory) };
}

// Responder ao story: vira DM para o autor COM a foto do story junto (como no
// Instagram, que mostra a prévia do story na resposta). A imagem é copiada para
// a conversa não quebrar quando o story expirar. Story de vídeo vai só com texto.
async function responder(meId, idStory, texto) {
  const s = await storyModel.buscarPorId(idStory);
  if (!s) return { ok: false, motivo: 'NAO_ENCONTRADO' };
  if (s.id_usuario === meId) return { ok: false, motivo: 'PROPRIO' };
  const t = String(texto || '').trim();
  if (!t) return { ok: false, motivo: 'VAZIA' };
  let imagem = null;
  if (s.imagem) {
    try {
      const ext = path.extname(path.basename(s.imagem));
      const copia = `resp-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      await fs.promises.copyFile(path.join(UPLOAD_DIR, path.basename(s.imagem)), path.join(UPLOAD_DIR, copia));
      imagem = `/uploads/${copia}`;
    } catch (e) { imagem = null; }
  }
  const r = await dmService.enviar(meId, s.id_usuario, t.slice(0, 500), imagem, null, null,
    { ref: s.id_story, autor: s.id_usuario, tipo: 'resposta' });
  if (!r.ok && imagem) apagarUpload(imagem);
  return r;
}

// Encaminhar o story para alguém no Direct: a mídia é COPIADA no disco para a
// DM continuar funcionando depois que o story expirar.
async function encaminhar(meId, idStory, paraId) {
  const s = await storyModel.buscarPorId(idStory);
  if (!s) return { ok: false, motivo: 'NAO_ENCONTRADO' };
  const origem = s.imagem || s.video;
  if (!origem) return { ok: false, motivo: 'SEM_MIDIA' };
  const autor = await usuarioModel.buscarPorId(s.id_usuario);
  const ext = path.extname(path.basename(origem));
  const copia = `fwd-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  await fs.promises.copyFile(path.join(UPLOAD_DIR, path.basename(origem)), path.join(UPLOAD_DIR, copia));
  const caminho = `/uploads/${copia}`;
  const texto = `📤 Story de @${autor ? autor.usuario : '?'}`;
  const r = await dmService.enviar(meId, Number(paraId), texto, s.imagem ? caminho : null, null, s.video ? caminho : null,
    { ref: s.id_story, autor: s.id_usuario, tipo: 'encaminhado' });
  if (!r.ok) apagarUpload(caminho); // DM falhou: não deixa a cópia órfã no disco
  return r;
}

// Só o autor (ou admin) apaga; a mídia sai do disco.
async function remover(meId, idStory, ehAdmin) {
  const s = await storyModel.buscarPorId(idStory);
  if (!s) return { ok: false, motivo: 'NAO_ENCONTRADO' };
  if (s.id_usuario !== meId && !ehAdmin) return { ok: false, motivo: 'SEM_PERMISSAO' };
  await storyModel.remover(idStory);
  apagarUpload(s.imagem);
  apagarUpload(s.video);
  return { ok: true };
}

module.exports = { publicar, listarAgrupado, resumoAneis, marcarVisto, remover, alternarCurtida, responder, encaminhar, vistosDe, repostar, marcarPessoa };
