'use strict';

/**
 * Configuração da engine de templates Handlebars.
 * Helpers utilitários ficam aqui (formatação de datas, badges de status, etc.).
 */
const { engine } = require('express-handlebars');
const Handlebars = require('handlebars');
const path = require('path');
const humores = require('./humores');
const mencoes = require('./mencoes');
const { fuso } = require('./fuso');

const viewsDir = path.join(__dirname, '..', 'views');

// Todas as horas/datas exibidas saem no fuso da aplicação (Brasília por padrão),
// independentemente do fuso do servidor.
const PT = 'pt-BR';
const tz = (opts) => Object.assign({ timeZone: fuso }, opts);

// "aaaa-mm-dd" de um instante, no fuso da aplicação (p/ comparar "mesmo dia").
function diaLocal(d) {
  return d.toLocaleDateString('en-CA', { timeZone: fuso });
}

const helpers = {
  // Ano atual (rodapé)
  anoAtual() {
    return new Date().getFullYear();
  },

  // Igualdade simples para uso em {{#if (eq a b)}}
  eq(a, b) {
    return a === b;
  },

  // {{#if (comeca caminhoAtual "/admin/usuarios")}} — link ativo da sidebar
  comeca(valor, prefixo) {
    return typeof valor === 'string' && valor.indexOf(prefixo) === 0;
  },

  // OU lógico para uso em {{#if (ou a b)}}
  ou(a, b) {
    return a || b;
  },

  // Primeiro item de uma lista / quantos além do primeiro / lista unida (post em dupla "e +N")
  primeiro(arr) {
    return Array.isArray(arr) && arr.length ? arr[0] : '';
  },
  alemDoPrimeiro(arr) {
    return Array.isArray(arr) && arr.length > 1 ? arr.length - 1 : 0;
  },
  juntar(arr) {
    return Array.isArray(arr) ? arr.join(', ') : '';
  },
  // Ids separados por vírgula, sem espaço (querystring/data-attr)
  lista(arr) {
    return Array.isArray(arr) ? arr.join(',') : '';
  },

  // Últimos N itens de uma lista (prévia de comentários no card do post)
  ultimos(lista, n) {
    return Array.isArray(lista) ? lista.slice(-n) : [];
  },
  // Primeiros N itens (avatares de quem votou na enquete)
  primeiros(lista, n) {
    return Array.isArray(lista) ? lista.slice(0, n) : [];
  },

  // Número inteiro (COUNT do pg chega como string; 0 vira falsy para {{#if}})
  num(n) {
    return parseInt(n, 10) || 0;
  },

  // Contador abreviado estilo Instagram: 96 → "96", 2200 → "2,2 mil"; zero vira vazio (some)
  abrevia(n) {
    n = parseInt(n, 10) || 0;
    if (!n) return '';
    if (n < 1000) return String(n);
    const v = n / 1000;
    const s = v % 1 === 0 || v >= 10 ? String(Math.round(v)) : v.toFixed(1).replace('.', ',');
    return `${s} mil`;
  },

  // Linha de curtidas estilo Instagram: "Curtido por fulano e outras pessoas"
  linhaCurtidas(curtidor, total) {
    const n = parseInt(total, 10) || 0;
    if (!n) return '';
    if (!curtidor) return new Handlebars.SafeString(`<strong>${n}</strong> curtida${n === 1 ? '' : 's'}`);
    let txt = `Curtido por <strong>${Handlebars.escapeExpression(curtidor)}</strong>`;
    if (n > 1) txt += ' e <strong>outras pessoas</strong>';
    return new Handlebars.SafeString(txt);
  },

  // Inicial do nome (avatar)
  inicial(nome) {
    return (String(nome || '').trim()[0] || '?').toUpperCase();
  },

  // Texto com @menções viradas em links (escapa o resto do conteúdo).
  comMencoes(texto) {
    if (!texto) return '';
    const esc = Handlebars.escapeExpression(String(texto));
    const html = esc.replace(mencoes.novaRegex(), (full, pre, user) =>
      `${pre}<a href="/u/${user.toLowerCase()}" class="mencao">@${user}</a>`);
    return new Handlebars.SafeString(html);
  },

  // Data no formato YYYY-MM-DD (para <input type="date">)
  dataISO(data) {
    if (!data) return '';
    const d = new Date(data);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  },

  // "22 de agosto" (usa UTC p/ não deslocar o dia da data de nascimento)
  diaMesExtenso(data) {
    if (!data) return '';
    const d = new Date(data);
    if (Number.isNaN(d.getTime())) return '';
    const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    return `${d.getUTCDate()} de ${meses[d.getUTCMonth()]}`;
  },

  // "julho de 2026"
  mesAnoExtenso(data) {
    if (!data) return '';
    const d = new Date(data);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(PT, tz({ month: 'long', year: 'numeric' }));
  },

  // Emoji / rótulo do status do dia (humor)
  emojiHumor(chave) {
    return humores.emojiDe(chave);
  },
  rotuloHumor(chave) {
    return humores.rotuloDe(chave);
  },

  // Tempo relativo ("agora", "há 5 min", "há 2 h", "há 3 d")
  tempoRel(data) {
    if (!data) return '';
    const d = new Date(data);
    const seg = Math.floor((Date.now() - d.getTime()) / 1000);
    if (seg < 45) return 'agora';
    if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
    if (seg < 86400) return `há ${Math.floor(seg / 3600)} h`;
    if (seg < 604800) return `há ${Math.floor(seg / 86400)} d`;
    return d.toLocaleDateString(PT, tz({ day: '2-digit', month: 'short' }));
  },

  // Hora da mensagem no chat (estilo WhatsApp): hoje → "14:32"; outro dia → "28/08 14:32"
  horaMsg(data) {
    if (!data) return '';
    const d = new Date(data);
    if (Number.isNaN(d.getTime())) return '';
    const hm = d.toLocaleTimeString(PT, tz({ hour: '2-digit', minute: '2-digit' }));
    return diaLocal(d) === diaLocal(new Date())
      ? hm
      : `${d.toLocaleDateString(PT, tz({ day: '2-digit', month: '2-digit' }))} ${hm}`;
  },

  // Formata TIMESTAMP para pt-BR (dd/mm/aaaa hh:mm)
  formatarData(data) {
    if (!data) return '-';
    const d = new Date(data);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString(PT, tz({ dateStyle: 'short', timeStyle: 'short' }));
  },

  // Rótulo amigável para os códigos de ação dos logs.
  rotuloAcao(acao) {
    const mapa = {
      LOGIN_SUCESSO: 'Login', LOGIN_FALHA: 'Falha de login', LOGOUT: 'Logout',
      SENHA_TROCADA: 'Trocou a senha', SENHA_RESETADA: 'Resetou senha',
      CADASTRO_SOLICITADO: 'Solicitou cadastro', CADASTRO_APROVADO: 'Aprovou cadastro', CADASTRO_RECUSADO: 'Recusou cadastro',
      USUARIO_CRIADO: 'Criou usuário', USUARIO_EDITADO: 'Editou usuário', USUARIO_ATIVADO: 'Ativou usuário', USUARIO_INATIVADO: 'Inativou usuário', USUARIO_EXCLUIDO: 'Excluiu usuário',
      CAMPANHA_CRIADA: 'Criou campanha', CAMPANHA_EDITADA: 'Editou campanha', CAMPANHA_ENCERRADA: 'Encerrou campanha',
      PARTICIPANTE_ADICIONADO: 'Adicionou participante', PARTICIPANTE_REMOVIDO: 'Removeu participante',
      SORTEIO_INICIADO: 'Iniciou sorteio', SORTEIO_REFEITO: 'Refez sorteio', SORTEIO_REVELADO: 'Revelou sorteio',
      AVISO_CRIADO: 'Publicou aviso', AVISO_EDITADO: 'Editou aviso', AVISO_EXCLUIDO: 'Excluiu aviso',
    };
    return mapa[acao] || acao;
  },

  // Classe de badge Bootstrap conforme status da campanha
  badgeStatus(status) {
    const mapa = {
      RASCUNHO: 'bg-secondary',
      EM_ANDAMENTO: 'bg-success',
      ENCERRADA: 'bg-dark',
    };
    return mapa[status] || 'bg-light text-dark';
  },
};

const hbs = engine({
  extname: '.handlebars',
  defaultLayout: 'main',
  layoutsDir: path.join(viewsDir, 'layouts'),
  partialsDir: path.join(viewsDir, 'partials'),
  helpers,
});

module.exports = { hbs, viewsDir };