'use strict';

/**
 * Regras dos Stories (estilo Instagram): publicar foto/vídeo que expira em 24 h,
 * listar agrupado por pessoa, marcar visto e limpar expirados (banco + disco).
 */
const fs = require('fs');
const path = require('path');
const storyModel = require('../models/story.model');
const usuarioModel = require('../models/usuario.model');
const dmService = require('./mensagemDireta.service');
const { apagarUpload, UPLOAD_DIR } = require('../config/upload');

// Tira do banco e do disco os stories com mais de 24 h (chamado nas listagens).
async function limparExpirados() {
  const mortos = await storyModel.removerExpirados();
  mortos.forEach((m) => { apagarUpload(m.imagem); apagarUpload(m.video); });
}

async function publicar(idUsuario, imagem, video, mencaoId = null) {
  if (!imagem && !video) return { ok: false, motivo: 'VAZIO' };

  // Menção (marcar alguém): valida a pessoa; se inválida, publica sem menção.
  let mencao = null;
  if (mencaoId && Number(mencaoId) !== Number(idUsuario)) {
    const m = await usuarioModel.buscarPorId(Number(mencaoId));
    if (m && m.status === 'APROVADO' && m.ativo && m.tipo_usuario === 'PARTICIPANTE') mencao = m.id_usuario;
  }

  const id = await storyModel.criar(idUsuario, imagem, video, mencao);

  // Como no Instagram: quem foi marcado recebe no DIRECT o card do story com
  // o botão "Repostar esse story". A mídia é copiada pro card não quebrar.
  if (mencao) {
    try {
      const origem = imagem || video;
      const ext = path.extname(path.basename(origem));
      const copia = `mnc-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      await fs.promises.copyFile(path.join(UPLOAD_DIR, path.basename(origem)), path.join(UPLOAD_DIR, copia));
      const caminho = `/uploads/${copia}`;
      const r = await dmService.enviar(idUsuario, mencao, null, imagem ? caminho : null, null, video ? caminho : null,
        { ref: id, autor: idUsuario, tipo: 'mencao' });
      if (!r.ok) apagarUpload(caminho);
    } catch (e) { /* menção sem DM não derruba a publicação */ }
  }

  return { ok: true, id_story: id };
}

// Repostar um story em que EU fui marcado (vídeo: cópia direta; foto o front
// compõe no fundo dourado da marca e publica como imagem nova).
async function repostar(meId, idStory) {
  const s = await storyModel.buscarPorId(idStory);
  if (!s) return { ok: false, motivo: 'NAO_ENCONTRADO' };
  if (Number(s.mencao) !== Number(meId)) return { ok: false, motivo: 'SEM_PERMISSAO' };
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

module.exports = { publicar, listarAgrupado, resumoAneis, marcarVisto, remover, alternarCurtida, responder, encaminhar, vistosDe, repostar };
