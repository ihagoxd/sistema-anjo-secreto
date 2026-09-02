'use strict';

/**
 * Otimização de imagens enviadas (fotos de post, story, chat, perfil).
 *
 * Celulares mandam JPEGs de 3–5 MB (4000×3000). A tela mostra no máximo ~1000 px,
 * então guardamos a foto em até MAX_LADO px no lado maior, re-encodada com mozjpeg
 * em qualidade 85 — visualmente idêntica, 10–15× menor, e a rotação EXIF passa a
 * ser aplicada de verdade (nada de foto deitada). GIF/WebP animado não são tocados.
 *
 * Nunca lança: se algo falhar, o arquivo original fica como está.
 */
const fs = require('fs');
const path = require('path');

let sharp = null;
try { sharp = require('sharp'); } catch (e) { console.warn('[imagem] sharp não instalado — fotos ficam no tamanho original'); }

const MAX_LADO = 1600;
const QUALIDADE = 85;

function disponivel() {
  return !!sharp;
}

/**
 * Otimiza o arquivo no lugar (mesmo nome/caminho). Retorna { antes, depois, ok }.
 * mimetype: image/jpeg | image/png | image/webp | image/gif (gif é pulado)
 */
async function otimizarImagem(caminho, mimetype, opts = {}) {
  const info = { antes: 0, depois: 0, ok: false, pulado: false };
  if (!sharp) { info.pulado = true; return info; }
  try {
    const tipo = mimetype || tipoPorExtensao(caminho);
    if (tipo === 'image/gif') { info.pulado = true; return info; }

    // Lê para a memória: sharp não fica com o arquivo aberto (no Windows isso
    // impediria a regravação no mesmo caminho).
    const original = fs.readFileSync(caminho);
    info.antes = original.length;

    const meta = await sharp(original).metadata();
    if ((meta.pages || 1) > 1) { info.pulado = true; return info; } // animado

    const maxLado = opts.maxLado || MAX_LADO;
    const precisaRedimensionar = (meta.width || 0) > maxLado || (meta.height || 0) > maxLado;
    const temOrientacao = (meta.orientation || 1) !== 1;

    let pipe = sharp(original, { failOn: 'none' })
      .rotate() // aplica a orientação EXIF (e o EXIF é descartado na saída)
      .resize({ width: maxLado, height: maxLado, fit: 'inside', withoutEnlargement: true });

    if (tipo === 'image/png') pipe = pipe.png({ compressionLevel: 9, effort: 7 });
    else if (tipo === 'image/webp') pipe = pipe.webp({ quality: opts.qualidade || QUALIDADE, effort: 4 });
    else pipe = pipe.jpeg({ quality: opts.qualidade || QUALIDADE, mozjpeg: true });

    const buf = await pipe.toBuffer();
    // Só substitui se ficou menor, ou se precisou redimensionar/rotacionar (aí vale mesmo que fique parecido)
    if (buf.length < info.antes || precisaRedimensionar || temOrientacao) {
      fs.writeFileSync(caminho, buf);
      info.depois = buf.length;
    } else {
      info.depois = info.antes;
    }
    info.ok = true;
    return info;
  } catch (e) {
    console.error('[imagem] falha ao otimizar', path.basename(caminho), e.message);
    info.depois = info.antes;
    return info;
  }
}

function tipoPorExtensao(caminho) {
  const ext = path.extname(caminho).toLowerCase();
  return { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }[ext] || null;
}

module.exports = { otimizarImagem, disponivel, tipoPorExtensao, MAX_LADO, QUALIDADE };
