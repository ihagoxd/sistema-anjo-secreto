'use strict';

const campanhaService = require('../services/campanha.service');
const sorteioService = require('../services/sorteio.service');
const preferenciaService = require('../services/preferencia.service');
const mensagemService = require('../services/mensagem.service');
const usuarioModel = require('../models/usuario.model');
const { montarGostos } = require('../config/gostos');
const { apagarUpload } = require('../config/upload');

function ehParticipante(req) {
  return req.session.usuario.tipo_usuario === 'PARTICIPANTE';
}

// Painel: campanha + protegido + não lidas + (modal de 1º acesso).
async function getDashboard(req, res, next) {
  try {
    const idUsuario = req.session.usuario.id_usuario;
    const campanhaAtiva = await campanhaService.buscarCampanhaAtiva();
    const protegido = campanhaAtiva
      ? await sorteioService.buscarProtegidoDoAnjo(campanhaAtiva.id_campanha, idUsuario)
      : null;
    if (protegido) {
      const pf = await usuarioModel.buscarPorId(protegido.id_usuario);
      if (pf) protegido.foto_perfil = pf.foto_perfil;
    }
    const minhas = await preferenciaService.buscarPreferenciasPorUsuario(idUsuario);
    const naoLidas = (campanhaAtiva && protegido)
      ? await mensagemService.contarNaoLidas(campanhaAtiva.id_campanha, idUsuario)
      : 0;

    // Modal de perfil: participante que ainda não completou o perfil.
    const mostrarModalPerfil = ehParticipante(req) && !req.session.usuario.perfil_completo;
    let bio = null;
    let dataNascimento = null;
    if (mostrarModalPerfil) {
      const u = await usuarioModel.buscarPorId(idUsuario);
      bio = u ? u.bio : null;
      dataNascimento = u ? u.data_nascimento : null;
    }

    res.render('participante/dashboard', {
      titulo: 'Meu painel',
      campanhaAtiva,
      protegido,
      temPreferencias: !!minhas,
      naoLidas,
      mostrarModalPerfil,
      prefs: minhas || {},
      bio,
      dataNascimento,
      maxData: new Date().toISOString().slice(0, 10),
      maxFotos: preferenciaService.MAX_FOTOS,
    });
  } catch (err) {
    next(err);
  }
}

async function getProtegido(req, res, next) {
  try {
    const campanhaAtiva = await campanhaService.buscarCampanhaAtiva();
    if (!campanhaAtiva) {
      req.session.flash = { erro: 'Nenhuma campanha em andamento no momento.' };
      return res.redirect('/participante');
    }
    const dados = await preferenciaService.buscarPreferenciasDoProtegido(
      campanhaAtiva.id_campanha,
      req.session.usuario.id_usuario
    );
    if (!dados) {
      req.session.flash = { erro: 'Você não está participando desta campanha.' };
      return res.redirect('/participante');
    }
    res.render('participante/protegido', {
      titulo: 'Meu protegido',
      campanhaAtiva,
      protegido: dados.protegido,
      gostos: montarGostos(dados.preferencias),
      fotos: dados.fotos,
    });
  } catch (err) {
    next(err);
  }
}

// Editor de perfil (página completa).
async function getPreferencias(req, res, next) {
  try {
    const idUsuario = req.session.usuario.id_usuario;
    const [prefs, fotos, u] = await Promise.all([
      preferenciaService.buscarPreferenciasPorUsuario(idUsuario),
      preferenciaService.listarFotos(idUsuario),
      usuarioModel.buscarPorId(idUsuario),
    ]);
    res.render('participante/preferencias', {
      titulo: 'Meu perfil',
      prefs: prefs || {},
      fotos,
      fotoPerfil: req.session.usuario.foto_perfil,
      bio: u ? u.bio : null,
      dataNascimento: u ? u.data_nascimento : null,
      maxData: new Date().toISOString().slice(0, 10),
      maxFotos: preferenciaService.MAX_FOTOS,
    });
  } catch (err) {
    next(err);
  }
}

// Salva o perfil (multipart): foto de perfil + preferências + galeria.
async function postPerfil(req, res, next) {
  try {
    const idUsuario = req.session.usuario.id_usuario;
    await preferenciaService.salvarPreferencias(idUsuario, req.body);

    const bio = String(req.body.bio || '').trim().slice(0, 200) || null;
    await usuarioModel.atualizarBio(idUsuario, bio);

    // Data de nascimento (YYYY-MM-DD válido e não futuro) ou limpar.
    const dn = String(req.body.data_nascimento || '').trim();
    let nascimento = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dn)) {
      const d = new Date(dn);
      if (!Number.isNaN(d.getTime()) && d <= new Date()) nascimento = dn;
    }
    await usuarioModel.atualizarNascimento(idUsuario, nascimento);

    const fp = req.files && req.files.foto_perfil && req.files.foto_perfil[0];
    if (fp) {
      const caminho = '/uploads/' + fp.filename;
      const atual = await usuarioModel.buscarPorId(idUsuario);
      if (atual && atual.foto_perfil) apagarUpload(atual.foto_perfil);
      await usuarioModel.atualizarFoto(idUsuario, caminho);
      req.session.usuario.foto_perfil = caminho;
    }

    const galeria = (req.files && req.files.fotos) ? req.files.fotos.map((f) => '/uploads/' + f.filename) : [];
    const r = await preferenciaService.adicionarFotos(idUsuario, galeria);

    await usuarioModel.marcarPerfilCompleto(idUsuario);
    req.session.usuario.perfil_completo = true;

    let msg = 'Perfil atualizado! Seu anjo vai adorar. ✨';
    if (r.ignoradas > 0) msg += ` (${r.ignoradas} foto(s) não couberam no limite de ${preferenciaService.MAX_FOTOS}.)`;
    req.session.flash = { sucesso: msg };
    res.redirect('/participante/preferencias');
  } catch (err) {
    next(err);
  }
}

async function postRemoverFotoPerfil(req, res, next) {
  try {
    const idUsuario = req.session.usuario.id_usuario;
    const atual = await usuarioModel.buscarPorId(idUsuario);
    if (atual && atual.foto_perfil) apagarUpload(atual.foto_perfil);
    await usuarioModel.atualizarFoto(idUsuario, null);
    req.session.usuario.foto_perfil = null;
    req.session.flash = { sucesso: 'Foto de perfil removida.' };
    res.redirect('/participante/preferencias');
  } catch (err) {
    next(err);
  }
}

async function postRemoverFoto(req, res, next) {
  try {
    await preferenciaService.removerFoto(req.params.id_foto, req.session.usuario.id_usuario);
    req.session.flash = { sucesso: 'Foto removida.' };
    res.redirect('/participante/preferencias');
  } catch (err) {
    next(err);
  }
}

async function postLegendaFoto(req, res, next) {
  try {
    await preferenciaService.salvarLegenda(req.params.id_foto, req.session.usuario.id_usuario, req.body.legenda);
    req.session.flash = { sucesso: 'Legenda salva. ✍️' };
    res.redirect('/participante/preferencias');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDashboard, getProtegido, getPreferencias,
  postPerfil, postRemoverFotoPerfil, postRemoverFoto, postLegendaFoto,
};
