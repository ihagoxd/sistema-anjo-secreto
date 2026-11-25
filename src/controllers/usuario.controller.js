'use strict';

const usuarioService = require('../services/usuario.service');
const { buscarPorId } = require('../models/usuario.model');
const { semAcentoJs } = require('../config/db');
const { registrarLog } = require('../services/log.service');
const { responder, renderizar, ehFetch } = require('../utils/responder');

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
  JA_INATIVO: 'Esse usuário já está inativo.',
  JA_ATIVO: 'Esse usuário já está ativo.',
  EM_CAMPANHA_ATIVA: 'Não dá para excluir: este usuário está numa campanha em andamento. Refaça o sorteio sem ele (inativando-o antes) ou encerre a campanha.',
  EM_CAMPANHA_ATIVA_TIPO: 'Não dá para virar administrador agora: a pessoa está na campanha em andamento (admin não joga). Inative-a e refaça o sorteio, ou espere a campanha encerrar.',
  ULTIMO_ADMIN: 'Não é possível: este é o último administrador ativo.',
  SELF_SENHA: 'Para trocar a sua própria senha, saia e entre de novo com a opção de troca, ou peça a outro administrador.',
};

const FILTROS = ['todos', 'pendentes', 'aprovados', 'recusados', 'inativos', 'admins'];

function flash(req, tipo, msg) {
  req.session.flash = { [tipo]: msg };
}

// Situação resumida de cada pessoa na lista: pendente | recusado | inativo | ativo
const SIT_ROTULO = { pendente: 'Aguardando aprovação', recusado: 'Recusado', inativo: 'Inativo', ativo: 'Ativo' };
function paraLinha(u, idMe) {
  const sit = u.status === 'PENDENTE' ? 'pendente' : u.status === 'RECUSADO' ? 'recusado' : !u.ativo ? 'inativo' : 'ativo';
  return { ...u, sit, sitRotulo: SIT_ROTULO[sit], ehEu: Number(u.id_usuario) === Number(idMe) };
}

// Linha atualizada da pessoa (HTML pronto) + contagens dos filtros, para a tela trocar na hora.
async function linhaAtualizada(req, res, idUsuario) {
  const [u, resumo] = await Promise.all([buscarPorId(idUsuario), usuarioService.contarResumo()]);
  const html = u ? await renderizar(res, 'partials/admUsuario', paraLinha(u, req.session.usuario.id_usuario)) : '';
  return { html, resumo };
}

// Volta para a lista mantendo busca/filtro de onde a ação partiu.
function voltarLista(req) {
  const ref = req.get('Referer') || '';
  const m = /\/admin\/usuarios(\?[^#]*)?$/.exec(ref);
  return m ? `/admin/usuarios${m[1] || ''}` : '/admin/usuarios';
}

// ---------- Lista + criação ----------
async function getLista(req, res, next) {
  try {
    const busca = String(req.query.q || '').trim();
    const filtro = FILTROS.includes(req.query.f) ? req.query.f : 'todos';
    // A lista vem inteira: busca e filtros trocam na hora no navegador. O filtro/busca da URL
    // já chegam aplicados (as linhas fora dele vêm escondidas), sem piscar a lista toda.
    const [usuarios, resumo] = await Promise.all([
      usuarioService.listarUsuarios('', 'todos'),
      usuarioService.contarResumo(),
    ]);
    const filtros = [
      { chave: 'todos', rotulo: 'Todos', n: resumo.todos },
      { chave: 'pendentes', rotulo: 'Pendentes', n: resumo.pendentes, alerta: resumo.pendentes > 0 },
      { chave: 'aprovados', rotulo: 'Ativos', n: resumo.aprovados },
      { chave: 'inativos', rotulo: 'Inativos', n: resumo.inativos },
      { chave: 'recusados', rotulo: 'Recusados', n: resumo.recusados },
      { chave: 'admins', rotulo: 'Administradores', n: resumo.admins },
    ].map((f) => ({ ...f, ativo: f.chave === filtro }));
    const me = req.session.usuario.id_usuario;
    const termo = semAcentoJs(busca.toLowerCase());
    const lista = usuarios.map((u) => {
      const l = paraLinha(u, me);
      const noFiltro = { todos: true, pendentes: l.sit === 'pendente', aprovados: l.sit === 'ativo', inativos: !u.ativo, recusados: l.sit === 'recusado', admins: u.tipo_usuario === 'ADMINISTRADOR' }[filtro];
      const naBusca = !termo || semAcentoJs(`${u.nome} ${u.usuario}`.toLowerCase()).includes(termo.replace(/^@/, ''));
      l.oculto = !(noFiltro && naBusca);
      return l;
    });
    res.render('admin/usuarios', { titulo: 'Usuários', pagina: 'adm-usuarios', usuarios: lista, busca, filtro, filtros, resumo, algumVisivel: lista.some((l) => !l.oculto) });
  } catch (err) {
    next(err);
  }
}

async function postCriar(req, res, next) {
  try {
    const { nome, usuario, senha, tipo_usuario } = req.body;
    const r = await usuarioService.criarUsuario({ nome, usuario, senha, tipoUsuario: tipo_usuario });
    if (!r.ok) return responder(req, res, { ok: false, erro: MSG[r.motivo] || 'Não foi possível criar o usuário.', destino: '/admin/usuarios' });
    await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'USUARIO_CRIADO', descricao: `usuario: ${r.usuario.usuario}`, entidade: 'usuario', idReferencia: r.usuario.id_usuario, ip: req.ip });
    responder(req, res, {
      msg: `${r.usuario.nome} foi criado(a)`,
      flash: `Usuário "${r.usuario.nome}" criado. A senha definida é provisória: no primeiro login a pessoa cria a dela.`,
      destino: '/admin/usuarios',
      dados: { id_usuario: r.usuario.id_usuario, ...(await linhaAtualizada(req, res, r.usuario.id_usuario)) },
    });
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
    if (!r.ok) return responder(req, res, { ok: false, erro: MSG[r.motivo] || 'Não foi possível salvar.', destino: `/admin/usuarios/${req.params.id_usuario}/editar` });
    // Editou a si mesmo: a sessão passa a refletir o novo nome/login na hora.
    if (r.ehProprio) {
      req.session.usuario.nome = r.usuario.nome;
      req.session.usuario.usuario = r.usuario.usuario;
    }
    await registrarLog({ idUsuario: idAtor, acao: 'USUARIO_EDITADO', descricao: `usuario: ${r.usuario.usuario}${r.mudouTipo ? ` (agora ${r.usuario.tipo_usuario === 'ADMINISTRADOR' ? 'administrador' : 'participante'})` : ''}`, entidade: 'usuario', idReferencia: r.usuario.id_usuario, ip: req.ip });
    const aviso = r.mudouTipo && !r.ehProprio ? 'Como o tipo mudou, a sessão da pessoa foi encerrada: no próximo login ela já entra com o novo perfil.' : null;
    responder(req, res, {
      msg: 'Alterações salvas',
      flash: `Usuário "${r.usuario.nome}" atualizado.${aviso ? ` ${aviso}` : ''}`,
      destino: '/admin/usuarios',
      dados: { aviso, nome: r.usuario.nome, usuario: r.usuario.usuario },
    });
  } catch (err) {
    next(err);
  }
}

// ---------- Ativar / inativar ----------
async function postInativar(req, res, next) {
  try {
    const r = await usuarioService.inativarUsuario(req.params.id_usuario, req.session.usuario.id_usuario);
    if (!r.ok) return responder(req, res, { ok: false, erro: MSG[r.motivo] || 'Não foi possível inativar.', destino: voltarLista(req) });
    await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'USUARIO_INATIVADO', descricao: `usuario: ${r.usuario.usuario}`, entidade: 'usuario', idReferencia: Number(req.params.id_usuario), ip: req.ip });
    let msg = `"${r.usuario.nome}" foi inativado(a): não entra mais`;
    msg += r.sessoesDerrubadas ? ' e a sessão aberta foi encerrada.' : '.';
    const aviso = r.campanhaAtiva
      ? `${r.usuario.nome} está na campanha "${r.campanhaAtiva.nome}" em andamento: o anjo dessa pessoa continua com ela como protegida. Se ela saiu de vez, refaça o sorteio na campanha.`
      : null;
    if (aviso) msg += ` Atenção: ${aviso}`;
    responder(req, res, {
      msg: `${r.usuario.nome} foi inativado(a)`,
      flash: msg,
      destino: voltarLista(req),
      dados: { aviso, link: r.campanhaAtiva ? `/admin/campanhas/${r.campanhaAtiva.id_campanha}` : null, ...(await linhaAtualizada(req, res, req.params.id_usuario)) },
    });
  } catch (err) {
    next(err);
  }
}

async function postAtivar(req, res, next) {
  try {
    const r = await usuarioService.ativarUsuario(req.params.id_usuario);
    if (!r.ok) return responder(req, res, { ok: false, erro: MSG[r.motivo] || 'Não foi possível ativar.', destino: voltarLista(req) });
    await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'USUARIO_ATIVADO', descricao: `usuario: ${r.usuario.usuario}`, entidade: 'usuario', idReferencia: Number(req.params.id_usuario), ip: req.ip });
    let msg = `"${r.usuario.nome}" foi reativado(a).`;
    let aviso = null;
    if (r.aindaBloqueado) aviso = `O cadastro ainda está ${r.usuario.status === 'PENDENTE' ? 'pendente' : 'recusado'}: aprove para a pessoa conseguir entrar.`;
    else if (r.campanhaAtiva && r.temPar) msg += ` Ela volta ao par que já tinha na campanha "${r.campanhaAtiva.nome}" — nada muda no sorteio.`;
    else if (r.campanhaAtiva) aviso = `Ela só entra num par quando o sorteio da campanha "${r.campanhaAtiva.nome}" for refeito.`;
    if (aviso) msg += ` ${aviso}`;
    responder(req, res, {
      msg: `${r.usuario.nome} foi reativado(a)`,
      flash: msg,
      destino: voltarLista(req),
      dados: { aviso, ...(await linhaAtualizada(req, res, req.params.id_usuario)) },
    });
  } catch (err) {
    next(err);
  }
}

// ---------- Exclusão definitiva ----------
async function postExcluir(req, res, next) {
  try {
    const alvoId = Number(req.params.id_usuario);
    const r = await usuarioService.excluirUsuario(alvoId, req.session.usuario.id_usuario);
    if (!r.ok) return responder(req, res, { ok: false, erro: MSG[r.motivo] || 'Não foi possível excluir o usuário.', destino: voltarLista(req) });
    await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'USUARIO_EXCLUIDO', descricao: `usuario: ${r.usuario.usuario}`, entidade: 'usuario', idReferencia: alvoId, ip: req.ip });
    responder(req, res, {
      msg: `${r.usuario.nome} foi excluído(a)`,
      flash: `Usuário "${r.usuario.nome}" foi excluído permanentemente${r.arquivos ? ` (${r.arquivos} arquivo(s) de mídia removidos)` : ''}.`,
      destino: voltarLista(req),
      dados: { resumo: await usuarioService.contarResumo() },
    });
  } catch (err) {
    next(err);
  }
}

// ---------- Reset de senha ----------
async function postResetarSenha(req, res, next) {
  try {
    const idAtor = req.session.usuario.id_usuario;
    const r = await usuarioService.resetarSenha(req.params.id_usuario, req.body.senha, idAtor);
    if (!r.ok) return responder(req, res, { ok: false, erro: MSG[r.motivo] || 'Não foi possível redefinir a senha.', destino: `/admin/usuarios/${req.params.id_usuario}/editar` });
    await registrarLog({ idUsuario: idAtor, acao: 'SENHA_RESETADA', descricao: `usuario: ${r.usuario.usuario}`, entidade: 'usuario', idReferencia: r.usuario.id_usuario, ip: req.ip });
    // Tela fluida: a senha volta no JSON (só para este admin, nunca na URL) e aparece num cartão
    // com "Copiar". Sem JS, vai pela sessão e a tela de edição mostra o cartão uma vez.
    if (ehFetch(req)) return res.json({ ok: true, msg: 'Senha redefinida', senha: r.senhaProvisoria, nome: r.usuario.nome, ...(await linhaAtualizada(req, res, r.usuario.id_usuario)) });
    req.session.senhaResetada = { id: r.usuario.id_usuario, senha: r.senhaProvisoria };
    res.redirect(`/admin/usuarios/${r.usuario.id_usuario}/editar`);
  } catch (err) {
    next(err);
  }
}

module.exports = { linhaAtualizada, getLista, postCriar, getEditar, postEditar, postInativar, postAtivar, postExcluir, postResetarSenha };
