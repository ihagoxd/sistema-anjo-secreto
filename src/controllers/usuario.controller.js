'use strict';

const usuarioService = require('../services/usuario.service');
const { buscarPorId } = require('../models/usuario.model');
const { registrarLog } = require('../services/log.service');

const MSG = {
  NOME: 'Informe o nome completo.',
  USUARIO_INVALIDO: 'Usuário inválido: 3 a 80 caracteres (letras, números, ponto, hífen ou _).',
  TIPO_INVALIDO: 'Tipo de usuário inválido.',
  SENHA_CURTA: 'A senha deve ter ao menos 6 caracteres.',
  USUARIO_EXISTE: 'Esse usuário já está em uso. Escolha outro.',
  NAO_ENCONTRADO: 'Usuário não encontrado.',
  SELF: 'Você não pode inativar o seu próprio acesso.',
  SELF_REBAIXAR: 'Você não pode rebaixar o seu próprio acesso de administrador.',
  SELF_EXCLUIR: 'Você não pode excluir a sua própria conta.',
  EM_CAMPANHA_ATIVA: 'Não dá para excluir: este usuário está numa campanha em andamento. Encerre/refaça o sorteio ou apenas inative-o.',
  ULTIMO_ADMIN: 'Não é possível: este é o último administrador ativo.',
  SELF_SENHA: 'Para trocar a sua própria senha, saia e entre de novo com a opção de troca, ou peça a outro administrador.',
};

function flash(req, tipo, msg) {
  req.session.flash = { [tipo]: msg };
}

// ---------- Lista + criação ----------
async function getLista(req, res, next) {
  try {
    const busca = req.query.q || '';
    const usuarios = await usuarioService.listarUsuarios(busca);
    res.render('admin/usuarios', { titulo: 'Usuários', usuarios, busca });
  } catch (err) {
    next(err);
  }
}

async function postCriar(req, res, next) {
  try {
    const { nome, usuario, senha, tipo_usuario } = req.body;
    const r = await usuarioService.criarUsuario({ nome, usuario, senha, tipoUsuario: tipo_usuario });
    if (!r.ok) {
      flash(req, 'erro', MSG[r.motivo] || 'Não foi possível criar o usuário.');
      return res.redirect('/admin/usuarios');
    }
    await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'USUARIO_CRIADO', descricao: `usuario: ${r.usuario.usuario}`, entidade: 'usuario', idReferencia: r.usuario.id_usuario, ip: req.ip });
    flash(req, 'sucesso', `Usuário "${r.usuario.nome}" criado. A senha definida é provisória.`);
    res.redirect('/admin/usuarios');
  } catch (err) {
    next(err);
  }
}

// ---------- Edição ----------
async function getEditar(req, res, next) {
  try {
    const alvo = await buscarPorId(req.params.id_usuario);
    if (!alvo) {
      flash(req, 'erro', MSG.NAO_ENCONTRADO);
      return res.redirect('/admin/usuarios');
    }
    // Senha recém-redefinida (vem da sessão, mostrada UMA vez num cartão fixo
    // com botão de copiar — não some como o aviso do topo).
    let senhaResetada = null;
    if (req.session.senhaResetada && Number(req.session.senhaResetada.id) === Number(alvo.id_usuario)) {
      senhaResetada = req.session.senhaResetada.senha;
    }
    delete req.session.senhaResetada;
    res.render('admin/usuarioEditar', {
      titulo: 'Editar usuário',
      alvo,
      senhaResetada,
      ehProprio: Number(alvo.id_usuario) === Number(req.session.usuario.id_usuario),
    });
  } catch (err) {
    next(err);
  }
}

async function postEditar(req, res, next) {
  try {
    const { nome, usuario, tipo_usuario } = req.body;
    const idAtor = req.session.usuario.id_usuario;
    const r = await usuarioService.editarUsuario(req.params.id_usuario, { nome, usuario, tipoUsuario: tipo_usuario }, idAtor);
    if (!r.ok) {
      flash(req, 'erro', MSG[r.motivo] || 'Não foi possível salvar.');
      return res.redirect(`/admin/usuarios/${req.params.id_usuario}/editar`);
    }
    await registrarLog({ idUsuario: idAtor, acao: 'USUARIO_EDITADO', descricao: `usuario: ${r.usuario.usuario}`, entidade: 'usuario', idReferencia: r.usuario.id_usuario, ip: req.ip });
    flash(req, 'sucesso', `Usuário "${r.usuario.nome}" atualizado.`);
    res.redirect('/admin/usuarios');
  } catch (err) {
    next(err);
  }
}

// ---------- Ativar / inativar ----------
async function postInativar(req, res, next) {
  try {
    const r = await usuarioService.inativarUsuario(req.params.id_usuario, req.session.usuario.id_usuario);
    if (r.ok) {
      await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'USUARIO_INATIVADO', entidade: 'usuario', idReferencia: Number(req.params.id_usuario), ip: req.ip });
      flash(req, 'sucesso', `"${r.usuario.nome}" foi inativado.`);
    } else {
      flash(req, 'erro', MSG[r.motivo] || 'Não foi possível inativar.');
    }
    res.redirect('/admin/usuarios');
  } catch (err) {
    next(err);
  }
}

async function postAtivar(req, res, next) {
  try {
    const r = await usuarioService.ativarUsuario(req.params.id_usuario);
    if (r.ok) {
      await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'USUARIO_ATIVADO', entidade: 'usuario', idReferencia: Number(req.params.id_usuario), ip: req.ip });
      flash(req, 'sucesso', `"${r.usuario.nome}" foi reativado.`);
    } else {
      flash(req, 'erro', MSG[r.motivo] || 'Não foi possível ativar.');
    }
    res.redirect('/admin/usuarios');
  } catch (err) {
    next(err);
  }
}

// ---------- Exclusão definitiva ----------
async function postExcluir(req, res, next) {
  try {
    const alvoId = Number(req.params.id_usuario);
    const r = await usuarioService.excluirUsuario(alvoId, req.session.usuario.id_usuario);
    if (r.ok) {
      await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'USUARIO_EXCLUIDO', descricao: `usuario: ${r.usuario.usuario}`, entidade: 'usuario', idReferencia: alvoId, ip: req.ip });
      flash(req, 'sucesso', `Usuário "${r.usuario.nome}" foi excluído permanentemente.`);
    } else {
      flash(req, 'erro', MSG[r.motivo] || 'Não foi possível excluir o usuário.');
    }
    res.redirect('/admin/usuarios');
  } catch (err) {
    next(err);
  }
}

// ---------- Reset de senha ----------
async function postResetarSenha(req, res, next) {
  try {
    const idAtor = req.session.usuario.id_usuario;
    const r = await usuarioService.resetarSenha(req.params.id_usuario, req.body.senha, idAtor);
    if (!r.ok) {
      flash(req, 'erro', MSG[r.motivo] || 'Não foi possível redefinir a senha.');
      return res.redirect(`/admin/usuarios/${req.params.id_usuario}/editar`);
    }
    await registrarLog({ idUsuario: idAtor, acao: 'SENHA_RESETADA', descricao: `usuario: ${r.usuario.usuario}`, entidade: 'usuario', idReferencia: r.usuario.id_usuario, ip: req.ip });
    // A senha vai pela sessão (não pela URL) e a tela de edição mostra o cartão.
    req.session.senhaResetada = { id: r.usuario.id_usuario, senha: r.senhaProvisoria };
    res.redirect(`/admin/usuarios/${r.usuario.id_usuario}/editar`);
  } catch (err) {
    next(err);
  }
}

module.exports = { getLista, postCriar, getEditar, postEditar, postInativar, postAtivar, postExcluir, postResetarSenha };
