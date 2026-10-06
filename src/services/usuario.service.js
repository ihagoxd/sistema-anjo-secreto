'use strict';

/**
 * Regras de gestão de usuários pelo administrador:
 * aprovar/recusar cadastros e o CRUD completo (criar, editar, ativar/inativar, resetar senha).
 *
 * Toda mudança que tira o acesso de alguém (inativar, excluir, recusar, redefinir senha,
 * trocar o tipo) também DERRUBA as sessões abertas da pessoa — vale na hora.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const usuarioModel = require('../models/usuario.model');
const sorteioModel = require('../models/sorteio.model');
const { apagarUpload } = require('../config/upload');
const { normalizarUsuario, usuarioValido, SENHA_MIN } = require('./auth.service');

const TIPOS = ['ADMINISTRADOR', 'PARTICIPANTE'];

// ---------- Listagem / contagens ----------
function listarUsuarios(busca, filtro) {
  return usuarioModel.listarTodos({ busca, filtro });
}
function contarResumo() {
  return usuarioModel.contarResumo();
}
function listarPendentes() {
  return usuarioModel.listarPorStatus('PENDENTE');
}
function contarPendentes() {
  return usuarioModel.contarPorStatus('PENDENTE');
}
function contarTotal() {
  return usuarioModel.contarTotal();
}

// ---------- Aprovação de cadastros ----------
// Aprova um cadastro PENDENTE — ou REAPROVA um recusado por engano.
async function aprovarCadastro(idUsuario) {
  const u = await usuarioModel.buscarPorId(idUsuario);
  if (!u) return { ok: false, motivo: 'NAO_ENCONTRADO' };
  if (u.status === 'APROVADO') return { ok: false, motivo: 'JA_APROVADO' };
  await usuarioModel.atualizarStatus(idUsuario, 'APROVADO');
  return { ok: true, usuario: u, reaprovado: u.status === 'RECUSADO' };
}

async function recusarCadastro(idUsuario) {
  const u = await usuarioModel.buscarPorId(idUsuario);
  if (!u) return { ok: false, motivo: 'NAO_ENCONTRADO' };
  if (u.status !== 'PENDENTE') return { ok: false, motivo: 'NAO_PENDENTE' };
  await usuarioModel.atualizarStatus(idUsuario, 'RECUSADO');
  await usuarioModel.derrubarSessoes(idUsuario);
  return { ok: true, usuario: u };
}

// ---------- CRUD ----------
function validarDados({ nome, usuario, tipoUsuario }) {
  const nomeLimpo = String(nome || '').trim();
  const login = normalizarUsuario(usuario);
  if (nomeLimpo.length < 2) return { erro: 'NOME' };
  if (!usuarioValido(login)) return { erro: 'USUARIO_INVALIDO' };
  if (!TIPOS.includes(tipoUsuario)) return { erro: 'TIPO_INVALIDO' };
  return { nome: nomeLimpo, usuario: login, tipoUsuario };
}

async function criarUsuario({ nome, usuario, senha, tipoUsuario }) {
  const v = validarDados({ nome, usuario, tipoUsuario });
  if (v.erro) return { ok: false, motivo: v.erro };
  if (String(senha || '').length < SENHA_MIN) return { ok: false, motivo: 'SENHA_CURTA' };

  const senhaHash = await bcrypt.hash(String(senha), env.bcryptRounds);
  try {
    const novo = await usuarioModel.criar({ nome: v.nome, usuario: v.usuario, senhaHash, tipoUsuario: v.tipoUsuario });
    return { ok: true, usuario: novo };
  } catch (err) {
    if (err.code === '23505') return { ok: false, motivo: 'USUARIO_EXISTE' };
    throw err;
  }
}

async function editarUsuario(idUsuario, { nome, usuario, tipoUsuario }, idAtor) {
  const alvo = await usuarioModel.buscarPorId(idUsuario);
  if (!alvo) return { ok: false, motivo: 'NAO_ENCONTRADO' };

  const v = validarDados({ nome, usuario, tipoUsuario });
  if (v.erro) return { ok: false, motivo: v.erro };

  const ehProprio = Number(idAtor) === Number(idUsuario);
  const mudouTipo = alvo.tipo_usuario !== v.tipoUsuario;

  // Anti-lockout: não rebaixar o último admin ativo, nem rebaixar a si mesmo.
  const rebaixandoAdmin = alvo.tipo_usuario === 'ADMINISTRADOR' && v.tipoUsuario !== 'ADMINISTRADOR';
  if (rebaixandoAdmin) {
    if (ehProprio) return { ok: false, motivo: 'SELF_REBAIXAR' };
    if (alvo.ativo && (await usuarioModel.contarAdminsAtivos()) <= 1) return { ok: false, motivo: 'ULTIMO_ADMIN' };
  }
  // Promover a admin tira a pessoa do jogo (admin não participa do sorteio):
  // numa campanha em andamento isso quebraria o par dela — só depois de refazer/encerrar.
  const promovendo = alvo.tipo_usuario !== 'ADMINISTRADOR' && v.tipoUsuario === 'ADMINISTRADOR';
  if (promovendo && (await usuarioModel.participaDeCampanhaAtiva(idUsuario))) {
    return { ok: false, motivo: 'EM_CAMPANHA_ATIVA_TIPO' };
  }

  try {
    const atualizado = await usuarioModel.atualizar(idUsuario, v);
    // Mudou o tipo de OUTRA pessoa: derruba a sessão dela para o novo perfil valer já.
    if (mudouTipo && !ehProprio) await usuarioModel.derrubarSessoes(idUsuario);
    return { ok: true, usuario: atualizado, ehProprio, mudouTipo };
  } catch (err) {
    if (err.code === '23505') return { ok: false, motivo: 'USUARIO_EXISTE' };
    throw err;
  }
}

// Inativa: bloqueia o login, derruba a sessão aberta e tira a pessoa das campanhas
// abertas. Se ela está na campanha EM ANDAMENTO, avisa: o anjo dela continua com ela
// como protegida até o sorteio ser refeito.
async function inativarUsuario(idUsuario, idAtor) {
  const alvo = await usuarioModel.buscarPorId(idUsuario);
  if (!alvo) return { ok: false, motivo: 'NAO_ENCONTRADO' };
  if (Number(idAtor) === Number(idUsuario)) return { ok: false, motivo: 'SELF' };
  if (!alvo.ativo) return { ok: false, motivo: 'JA_INATIVO' };
  if (alvo.tipo_usuario === 'ADMINISTRADOR' && alvo.status === 'APROVADO' && (await usuarioModel.contarAdminsAtivos()) <= 1) {
    return { ok: false, motivo: 'ULTIMO_ADMIN' };
  }
  const campanha = await usuarioModel.campanhaAtivaDoUsuario(idUsuario);
  await usuarioModel.definirAtivo(idUsuario, false);
  const sessoes = await usuarioModel.derrubarSessoes(idUsuario);
  return { ok: true, usuario: alvo, campanhaAtiva: campanha, sessoesDerrubadas: sessoes };
}

async function ativarUsuario(idUsuario) {
  const alvo = await usuarioModel.buscarPorId(idUsuario);
  if (!alvo) return { ok: false, motivo: 'NAO_ENCONTRADO' };
  if (alvo.ativo) return { ok: false, motivo: 'JA_ATIVO' };
  await usuarioModel.definirAtivo(idUsuario, true);
  // Reativado durante uma campanha em andamento: se o par dele(a) ainda existe (foi
  // inativado depois do sorteio e ninguém refez), volta exatamente como estava; se não
  // tem par, só entra quando o sorteio for refeito (os pares atuais não mudam sozinhos).
  const campanha = await usuarioModel.campanhaAtivaDoUsuario(idUsuario);
  const temPar = campanha ? !!(await sorteioModel.buscarProtegidoDoAnjo(campanha.id_campanha, idUsuario)) : false;
  return { ok: true, usuario: alvo, campanhaAtiva: campanha, temPar, aindaBloqueado: alvo.status !== 'APROVADO' };
}

// Exclusão DEFINITIVA (hard delete). Protege contra: excluir a si mesmo,
// excluir o último admin ativo e excluir quem está numa campanha em andamento.
// Derruba a sessão e tira do disco tudo que a pessoa enviou.
async function excluirUsuario(idUsuario, idAtor) {
  const alvo = await usuarioModel.buscarPorId(idUsuario);
  if (!alvo) return { ok: false, motivo: 'NAO_ENCONTRADO' };
  if (Number(idAtor) === Number(idUsuario)) return { ok: false, motivo: 'SELF_EXCLUIR' };
  if (alvo.tipo_usuario === 'ADMINISTRADOR' && alvo.ativo && alvo.status === 'APROVADO' && (await usuarioModel.contarAdminsAtivos()) <= 1) {
    return { ok: false, motivo: 'ULTIMO_ADMIN' };
  }
  if (await usuarioModel.participaDeCampanhaAtiva(idUsuario)) {
    return { ok: false, motivo: 'EM_CAMPANHA_ATIVA' };
  }
  const arquivos = await usuarioModel.listarArquivosDoUsuario(idUsuario);
  await usuarioModel.derrubarSessoes(idUsuario);
  await usuarioModel.excluir(idUsuario);
  arquivos.forEach(apagarUpload);
  return { ok: true, usuario: alvo, arquivos: arquivos.length };
}

// Gera uma senha provisória legível (sem caracteres ambíguos).
function gerarSenhaProvisoria(tamanho = 8) {
  const alfabeto = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(tamanho);
  let s = '';
  for (let i = 0; i < tamanho; i++) s += alfabeto[bytes[i] % alfabeto.length];
  return s;
}

// Redefine a senha de alguém (quem esqueceu, por exemplo). O admin pode escolher
// a senha provisória ou deixar em branco para gerar uma. Seja qual for, ela vale
// só para o próximo login: o usuário é obrigado a criar a senha dele na hora.
// As sessões abertas da pessoa são derrubadas (a senha antiga deixa de valer já).
async function resetarSenha(idUsuario, senhaEscolhida, idAtor) {
  const alvo = await usuarioModel.buscarPorId(idUsuario);
  if (!alvo) return { ok: false, motivo: 'NAO_ENCONTRADO' };
  if (idAtor != null && Number(idAtor) === Number(idUsuario)) return { ok: false, motivo: 'SELF_SENHA' };

  const escolhida = String(senhaEscolhida || '').trim();
  if (escolhida && escolhida.length < SENHA_MIN) return { ok: false, motivo: 'SENHA_CURTA' };
  const senhaProvisoria = escolhida || gerarSenhaProvisoria();

  const senhaHash = await bcrypt.hash(senhaProvisoria, env.bcryptRounds);
  await usuarioModel.resetarSenha(idUsuario, senhaHash);
  await usuarioModel.derrubarSessoes(idUsuario);
  return { ok: true, usuario: alvo, senhaProvisoria };
}

module.exports = {
  listarUsuarios,
  contarResumo,
  listarPendentes,
  contarPendentes,
  contarTotal,
  aprovarCadastro,
  recusarCadastro,
  criarUsuario,
  editarUsuario,
  inativarUsuario,
  ativarUsuario,
  excluirUsuario,
  resetarSenha,
};
