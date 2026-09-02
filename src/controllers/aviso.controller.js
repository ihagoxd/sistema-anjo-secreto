'use strict';

const avisoService = require('../services/aviso.service');
const { registrarLog } = require('../services/log.service');

function flash(req, tipo, msg) {
  req.session.flash = { [tipo]: msg };
}

const TEMAS_ROTULO = {
  dourado: 'Dourado', azul: 'Azul', verde: 'Verde', roxo: 'Roxo', vermelho: 'Vermelho', escuro: 'Escuro',
};

// ---------- ADMIN ----------

// Página: formulário (novo ou edição) + prévia animada + lista dos avisos.
async function getAdmin(req, res, next) {
  try {
    const avisos = await avisoService.listar();
    let editando = null;
    if (req.query.editar) editando = await avisoService.buscarPorId(Number(req.query.editar));
    const modelo = editando || { emoji: '📢', tema: 'dourado', ativo: true };
    res.render('admin/avisos', {
      titulo: 'Avisos',
      pagina: 'admin-avisos',
      avisos,
      editando,
      modelo,
      expiraISO: modelo.expira_em ? new Date(modelo.expira_em).toLocaleDateString('en-CA') : '',
      temas: avisoService.TEMAS.map((t) => ({ chave: t, rotulo: TEMAS_ROTULO[t], ativo: t === modelo.tema })),
      limites: avisoService.LIMITES,
    });
  } catch (err) {
    next(err);
  }
}

// Cria (sem id) ou atualiza (com id_aviso no corpo).
async function postSalvar(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const id = Number(req.body.id_aviso) || 0;
    const r = id ? await avisoService.atualizar(id, req.body) : await avisoService.criar(req.body, me);
    if (!r.ok) {
      flash(req, 'erro', r.erro);
      return res.redirect(id ? `/admin/avisos?editar=${id}` : '/admin/avisos');
    }
    await registrarLog({
      idUsuario: me, acao: id ? 'AVISO_EDITADO' : 'AVISO_CRIADO', descricao: r.aviso.titulo,
      entidade: 'aviso', idReferencia: r.aviso.id_aviso, ip: req.ip,
    });
    flash(req, 'sucesso', id ? 'Aviso atualizado.' : (r.aviso.ativo ? 'Aviso publicado! Vai aparecer na tela de todo mundo.' : 'Aviso salvo como rascunho.'));
    res.redirect('/admin/avisos');
  } catch (err) {
    next(err);
  }
}

async function postAlternar(req, res, next) {
  try {
    const r = await avisoService.alternarAtivo(Number(req.params.id));
    if (!r) flash(req, 'erro', 'Aviso não encontrado.');
    else flash(req, 'sucesso', r.ativo ? 'Aviso reativado.' : 'Aviso desativado — some da tela de todos.');
    res.redirect('/admin/avisos');
  } catch (err) {
    next(err);
  }
}

async function postExcluir(req, res, next) {
  try {
    const id = Number(req.params.id);
    const aviso = await avisoService.buscarPorId(id);
    const n = await avisoService.excluir(id);
    if (n) {
      await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'AVISO_EXCLUIDO', descricao: aviso ? aviso.titulo : null, entidade: 'aviso', idReferencia: id, ip: req.ip });
      flash(req, 'sucesso', 'Aviso excluído.');
    } else flash(req, 'erro', 'Aviso não encontrado.');
    res.redirect('/admin/avisos');
  } catch (err) {
    next(err);
  }
}

// ---------- USUÁRIO ----------

// "Entendi": marca como visto (AJAX). Devolve quantos ainda faltam.
async function postVisto(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    await avisoService.marcarVisto(Number(req.params.id), me);
    const restantes = await avisoService.pendentesPara(me);
    if ((req.get('x-requested-with') || '') === 'fetch') return res.json({ ok: true, restantes: restantes.length });
    res.redirect(req.get('Referer') || '/');
  } catch (err) {
    next(err);
  }
}

// Página do aviso (destino da notificação): o card, sozinho.
async function getVer(req, res, next) {
  try {
    const aviso = await avisoService.buscarPorId(Number(req.params.id));
    if (!aviso || !aviso.ativo) {
      req.session.flash = { erro: 'Este aviso não está mais disponível.' };
      return res.redirect('/notificacoes');
    }
    res.render('avisos/ver', { titulo: aviso.titulo, aviso, pagina: 'aviso' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAdmin, postSalvar, postAlternar, postExcluir, postVisto, getVer };
