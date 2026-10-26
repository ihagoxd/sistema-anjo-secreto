'use strict';

/**
 * Vídeo dos posts e stories: deixa qualquer vídeo tocando em qualquer aparelho.
 *
 * - ffprobe lê codec, áudio e tamanho. Se já é MP4 H.264 + AAC (yuv420p, até 1080p) só faz o
 *   "faststart" (remux, rápido) e tira a capa. Senão (HEVC do iPhone, WebM do desktop, etc.)
 *   converte para H.264 MP4 (até 1080 px de largura, CRF 22, preset veryfast) com áudio AAC.
 * - Capa (JPEG) do primeiro meio segundo, para o card e a busca.
 * - Tudo em segundo plano, numa fila de um por vez (servidor com 2 vCPU): o post sai na hora
 *   com o arquivo original e troca para o convertido quando fica pronto.
 * - Sem ffmpeg no servidor: não faz nada (avisa uma vez no log) e o vídeo fica como foi enviado.
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { UPLOAD_DIR } = require('../config/upload');

const LARGURA_MAX = 1080;
let temFfmpeg = null;

function disponivel() {
  if (temFfmpeg !== null) return temFfmpeg;
  try {
    temFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0
      && spawnSync('ffprobe', ['-version'], { stdio: 'ignore' }).status === 0;
  } catch (e) { temFfmpeg = false; }
  if (!temFfmpeg) console.warn('[video] ffmpeg/ffprobe não encontrados: vídeos ficam como enviados (sem conversão nem capa).');
  return temFfmpeg;
}

function rodar(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; if (out.length > 1e6) out = out.slice(-1e6); });
    p.stderr.on('data', (d) => { err += d; if (err.length > 1e5) err = err.slice(-1e5); });
    const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} reject(new Error(`${cmd}: tempo esgotado`)); }, timeoutMs || 10 * 60 * 1000);
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (code) => { clearTimeout(t); if (code === 0) resolve(out); else reject(new Error(`${cmd} saiu com ${code}: ${err.slice(-400).trim()}`)); });
  });
}

async function sondar(abs) {
  const json = await rodar('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', abs], 60 * 1000);
  const d = JSON.parse(json || '{}');
  const streams = d.streams || [];
  const v = streams.find((s) => s.codec_type === 'video') || {};
  const a = streams.find((s) => s.codec_type === 'audio') || null;
  return {
    codec: v.codec_name || '', pix: v.pix_fmt || '', w: v.width || 0, h: v.height || 0,
    audio: a ? a.codec_name : null,
    dur: Number((d.format || {}).duration || v.duration || 0),
    formato: String((d.format || {}).format_name || ''),
  };
}

function precisaConverter(info, ext) {
  const mp4 = ext === '.mp4' || ext === '.m4v';
  return !(mp4 && info.codec === 'h264' && info.pix === 'yuv420p' && (!info.audio || info.audio === 'aac') && Math.max(info.w, info.h) <= 1920);
}

const ESCALA = `scale='min(${LARGURA_MAX},iw)':-2`;
function converter(absIn, absOut) {
  return rodar('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', absIn,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1', '-vf', ESCALA,
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-movflags', '+faststart', '-threads', '2', absOut], 15 * 60 * 1000);
}
function remux(absIn, absOut) {
  return rodar('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', absIn, '-c', 'copy', '-movflags', '+faststart', absOut], 5 * 60 * 1000);
}
function capa(absIn, absOut, dur) {
  return rodar('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', dur > 1 ? '0.5' : '0', '-i', absIn, '-frames:v', '1', '-vf', ESCALA, '-q:v', '3', absOut], 2 * 60 * 1000);
}

// Fila: um vídeo por vez, para não derrubar o servidor
let fila = Promise.resolve();
function enfileirar(fn) {
  const p = fila.then(fn, fn);
  fila = p.catch(() => {});
  return p;
}

/**
 * Processa um vídeo recém-enviado (caminho público, ex.: /uploads/vid-1-2.mov) em segundo plano.
 * aoPronto({ video, poster, info }) é chamado ao terminar — mesmo que só a capa tenha dado certo.
 */
function processar(caminhoRel, aoPronto) {
  if (!caminhoRel || !disponivel()) return;
  enfileirar(async () => {
    const nome = path.basename(caminhoRel);
    const abs = path.join(UPLOAD_DIR, nome);
    if (!fs.existsSync(abs)) return;
    const ext = path.extname(nome).toLowerCase();
    const base = nome.slice(0, nome.length - ext.length);
    const info = await sondar(abs);

    let poster = null;
    const posterNome = `${base}-capa.jpg`;
    try { await capa(abs, path.join(UPLOAD_DIR, posterNome), info.dur); poster = `/uploads/${posterNome}`; }
    catch (e) { console.warn('[video] capa falhou:', e.message); }

    let video = caminhoRel;
    const saidaNome = `${base}-h264.mp4`;
    const saidaAbs = path.join(UPLOAD_DIR, saidaNome);
    try {
      if (precisaConverter(info, ext)) await converter(abs, saidaAbs); else await remux(abs, saidaAbs);
      video = `/uploads/${saidaNome}`;
      fs.unlink(abs, () => {}); // o original sai do disco
    } catch (e) {
      console.error('[video] conversão falhou:', e.message);
      try { fs.unlinkSync(saidaAbs); } catch (x) {}
    }
    console.log(`[video] ${nome}: ${info.codec || '?'}/${info.audio || 'sem áudio'} ${info.w}x${info.h} ${Math.round(info.dur)}s → ${path.basename(video)}${poster ? ' + capa' : ''}`);
    await aoPronto({ video, poster, info });
  }).catch((e) => console.error('[video]', e.message));
}

module.exports = { disponivel, processar, sondar };
