'use strict';

/**
 * Otimiza as fotos JÁ existentes em src/public/uploads (uma vez, depois do deploy
 * que ligou a otimização automática). Os originais vão para uploads-originais/
 * (fora da pasta pública) antes de qualquer mudança — nada se perde.
 *
 *   node scripts/otimizar-uploads.js            # otimiza (com backup)
 *   node scripts/otimizar-uploads.js --simular  # só mostra o que faria
 *
 * Os nomes dos arquivos não mudam, então os caminhos gravados no banco seguem válidos.
 */
const fs = require('fs');
const path = require('path');
const { otimizarImagem, tipoPorExtensao, disponivel } = require('../src/config/imagem');

const UPLOAD_DIR = path.join(__dirname, '..', 'src', 'public', 'uploads');
const BACKUP_DIR = path.join(__dirname, '..', 'uploads-originais');
const simular = process.argv.includes('--simular');

function kb(n) { return `${Math.round(n / 1024)} KB`; }

(async () => {
  if (!disponivel()) { console.error('sharp não instalado (npm install).'); process.exit(1); }
  const nomes = fs.readdirSync(UPLOAD_DIR).filter((n) => /^(img|mnc|rps|resp|fwd)-.*\.(jpe?g|png|webp)$/i.test(n));
  console.log(`${nomes.length} imagem(ns) para avaliar em ${UPLOAD_DIR}`);
  if (!simular) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  let antesTotal = 0, depoisTotal = 0, mudadas = 0;
  for (const nome of nomes) {
    const abs = path.join(UPLOAD_DIR, nome);
    const tamanho = fs.statSync(abs).size;
    antesTotal += tamanho;
    if (simular) { console.log(`  ${nome}  ${kb(tamanho)}`); depoisTotal += tamanho; continue; }

    const bak = path.join(BACKUP_DIR, nome);
    if (!fs.existsSync(bak)) fs.copyFileSync(abs, bak);

    const r = await otimizarImagem(abs, tipoPorExtensao(nome));
    depoisTotal += r.depois || tamanho;
    if (r.ok && r.depois < r.antes) {
      mudadas++;
      console.log(`  ✓ ${nome}  ${kb(r.antes)} → ${kb(r.depois)}`);
    } else if (r.pulado) {
      console.log(`  · ${nome}  pulado`);
    }
  }
  console.log(`\nTotal: ${kb(antesTotal)} → ${kb(depoisTotal)}  (${mudadas} arquivo(s) reduzidos)`);
  if (!simular) console.log(`Originais guardados em ${BACKUP_DIR}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
