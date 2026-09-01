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

const viewsDir = path.join(__dirname, '..', 'views');

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

  // Número inteiro (COUNT do pg chega como string; 0 vira falsy para {{#if}})
  num(n) {
    return parseInt(n, 10) || 0;
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
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
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
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  },

  // Formata TIMESTAMP para pt-BR (dd/mm/aaaa hh:mm)
  formatarData(data) {
    if (!data) return '-';
    const d = new Date(data);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
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