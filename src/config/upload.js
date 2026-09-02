'use strict';

// Upload de imagens (foto de perfil e fotos das preferências) com multer.
// Mesmo padrão de segurança do sistema-sugestoes: extensão definida pelo TIPO
// validado (nunca pelo nome do cliente) + verificação por "magic bytes".
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { otimizarImagem } = require('./imagem');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const EXT_POR_TIPO = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};
const TIPOS_PERMITIDOS = Object.keys(EXT_POR_TIPO);

// Áudio das mensagens de voz (MediaRecorder: webm/opus no Chrome/Android, mp4/aac no iOS)
const EXT_AUDIO = {
  'audio/webm': '.webm',
  'audio/mp4': '.m4a',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav', // formato universal: o front converte a voz p/ WAV (toca até no iPhone)
  'audio/x-wav': '.wav',
};
// Vídeo gravado na câmera (MediaRecorder: webm no Chrome/Android, mp4/mov no iOS)
const EXT_VIDEO = {
  'video/webm': '.webm',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const tabela = { audio: EXT_AUDIO, video: EXT_VIDEO };
    const ext = (tabela[file.fieldname] || EXT_POR_TIPO)[file.mimetype] || '.bin';
    const prefixo = file.fieldname === 'audio' ? 'aud' : file.fieldname === 'video' ? 'vid' : 'img';
    const unico = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${prefixo}-${unico}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB por imagem
  fileFilter: (req, file, cb) => {
    if (TIPOS_PERMITIDOS.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Envie apenas imagens (PNG, JPG, GIF ou WEBP).'));
  },
});

// Mídia do chat e do mural: imagem, áudio de voz OU vídeo (campos separados, tipos por campo).
const uploadMsg = multer({
  storage,
  limits: { fileSize: 60 * 1024 * 1024 }, // 60 MB (vídeo de 1 min cabe folgado)
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'audio') {
      if (EXT_AUDIO[file.mimetype]) return cb(null, true);
      return cb(new Error('Áudio em formato não suportado.'));
    }
    if (file.fieldname === 'video') {
      if (EXT_VIDEO[file.mimetype]) return cb(null, true);
      return cb(new Error('Vídeo em formato não suportado.'));
    }
    if (TIPOS_PERMITIDOS.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Envie apenas imagens (PNG, JPG, GIF ou WEBP).'));
  },
});

// --- Verificação por magic bytes (o conteúdo bate com o tipo declarado?) ---
const ASSINATURAS = {
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/jpg': [[0xff, 0xd8, 0xff]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
  'audio/webm': [[0x1a, 0x45, 0xdf, 0xa3]], // contêiner EBML (WebM)
  'audio/ogg': [[0x4f, 0x67, 0x67, 0x53]], // "OggS"
  'audio/wav': [[0x52, 0x49, 0x46, 0x46]], // "RIFF" (+ "WAVE" no offset 8, conferido abaixo)
  'audio/x-wav': [[0x52, 0x49, 0x46, 0x46]],
  'audio/mpeg': [[0x49, 0x44, 0x33], [0xff, 0xfb], [0xff, 0xf3], [0xff, 0xf2]],
  'video/webm': [[0x1a, 0x45, 0xdf, 0xa3]], // contêiner EBML (WebM)
};
const TIPOS_FTYP = new Set(['audio/mp4', 'video/mp4', 'video/quicktime']);
function comecaCom(buf, assinatura) {
  if (buf.length < assinatura.length) return false;
  return assinatura.every((b, i) => buf[i] === b);
}
function assinaturaOk(buf, mimetype) {
  // MP4/M4A/MOV: o "ftyp" fica no offset 4 (os 4 primeiros bytes são o tamanho do box)
  if (TIPOS_FTYP.has(mimetype)) return buf.length >= 8 && buf.toString('ascii', 4, 8) === 'ftyp';
  const sigs = ASSINATURAS[mimetype];
  if (!sigs || !sigs.some((s) => comecaCom(buf, s))) return false;
  if (mimetype === 'image/webp') return buf.length >= 12 && buf.toString('ascii', 8, 12) === 'WEBP';
  if (mimetype === 'audio/wav' || mimetype === 'audio/x-wav') return buf.length >= 12 && buf.toString('ascii', 8, 12) === 'WAVE';
  return true;
}

// Reúne todos os arquivos da requisição (req.file e req.files de qualquer campo).
function todosArquivos(req) {
  const lista = [];
  if (req.file) lista.push(req.file);
  if (Array.isArray(req.files)) lista.push(...req.files);
  else if (req.files) Object.values(req.files).forEach((arr) => lista.push(...arr));
  return lista;
}

// Confere assinaturas; se algo não for imagem válida, apaga tudo e volta.
// Depois, OTIMIZA as imagens no lugar (redimensiona/re-encoda sem perda visível):
// foto de 4 MB do celular vira ~300 KB — é isso que faz mural e stories abrirem rápido.
async function conferirAssinaturas(req, res, next) {
  try {
    for (const f of todosArquivos(req)) {
      const buf = Buffer.alloc(16);
      const fd = fs.openSync(f.path, 'r');
      try { fs.readSync(fd, buf, 0, 16, 0); } finally { fs.closeSync(fd); }
      if (!assinaturaOk(buf, f.mimetype)) {
        todosArquivos(req).forEach((g) => { try { fs.unlinkSync(g.path); } catch (e) {} });
        req.session.flash = { erro: 'Arquivo rejeitado: o conteúdo não corresponde ao tipo declarado.' };
        return res.redirect(req.get('Referer') || '/participante');
      }
    }
    for (const f of todosArquivos(req)) {
      if (!EXT_POR_TIPO[f.mimetype]) continue; // só imagens (áudio/vídeo passam direto)
      const r = await otimizarImagem(f.path, f.mimetype);
      if (r.ok) f.size = r.depois;
    }
    next();
  } catch (e) {
    next(e);
  }
}

// Apaga um arquivo de upload pelo caminho público (/uploads/xxx).
function apagarUpload(caminhoPublico) {
  if (!caminhoPublico) return;
  const nome = path.basename(caminhoPublico);
  const abs = path.join(UPLOAD_DIR, nome);
  fs.unlink(abs, () => {});
}

module.exports = { upload, uploadMsg, UPLOAD_DIR, conferirAssinaturas, apagarUpload };
