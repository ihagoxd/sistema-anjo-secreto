'use strict';

// Upload de imagens (foto de perfil e fotos das preferências) com multer.
// Mesmo padrão de segurança do sistema-sugestoes: extensão definida pelo TIPO
// validado (nunca pelo nome do cliente) + verificação por "magic bytes".
const path = require('path');
const fs = require('fs');
const multer = require('multer');

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

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = EXT_POR_TIPO[file.mimetype] || '.bin';
    const unico = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `img-${unico}${ext}`);
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

// --- Verificação por magic bytes (o conteúdo bate com o tipo declarado?) ---
const ASSINATURAS = {
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/jpg': [[0xff, 0xd8, 0xff]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
};
function comecaCom(buf, assinatura) {
  if (buf.length < assinatura.length) return false;
  return assinatura.every((b, i) => buf[i] === b);
}
function assinaturaOk(buf, mimetype) {
  const sigs = ASSINATURAS[mimetype];
  if (!sigs || !sigs.some((s) => comecaCom(buf, s))) return false;
  if (mimetype === 'image/webp') return buf.length >= 12 && buf.toString('ascii', 8, 12) === 'WEBP';
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
function conferirAssinaturas(req, res, next) {
  try {
    for (const f of todosArquivos(req)) {
      const buf = Buffer.alloc(16);
      const fd = fs.openSync(f.path, 'r');
      try { fs.readSync(fd, buf, 0, 16, 0); } finally { fs.closeSync(fd); }
      if (!assinaturaOk(buf, f.mimetype)) {
        todosArquivos(req).forEach((g) => { try { fs.unlinkSync(g.path); } catch (e) {} });
        req.session.flash = { erro: 'Imagem rejeitada: o conteúdo não corresponde a um arquivo de imagem válido.' };
        return res.redirect(req.get('Referer') || '/participante');
      }
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

module.exports = { upload, UPLOAD_DIR, conferirAssinaturas, apagarUpload };
