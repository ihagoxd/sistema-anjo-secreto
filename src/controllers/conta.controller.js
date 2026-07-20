'use strict';

const usuarioModel = require('../models/usuario.model');
const { apagarUpload } = require('../config/upload');
const { ehValido } = require('../config/humores');

async function getConta(req, res, next) {
  try {
    const u = await usuarioModel.buscarPorId(req.session.usuario.id_usuario);
    res.render('conta/editar', {
      titulo: 'Editar perfil',
      u,
      maxData: new Date().toISOString().slice(0, 10),
      ehParticipante: req.session.usuario.tipo_usuario === 'PARTICIPANTE',
    });
  } catch (err) {
    next(err);
  }
}

async function postConta(req, res, next) {
  try {
    const id = req.session.usuario.id_usuario;
    const nome = String(req.body.nome || '').trim();
    const bio = String(req.body.bio || '').trim().slice(0, 150) || null;

    if (nome.length >= 2) {
      await usuarioModel.atualizarNome(id, nome);
      req.session.usuario.nome = nome;
    }
    await usuarioModel.atualizarBio(id, bio);

    // Data de nascimento (YYYY-MM-DD válido e não futuro) ou limpar.
    const dn = String(req.body.data_nascimento || '').trim();
    let nascimento = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dn)) {
      const d = new Date(dn);
      if (!Number.isNaN(d.getTime()) && d <= new Date()) nascimento = dn;
    }
    await usuarioModel.atualizarNascimento(id, nascimento);

    const foto = req.file;
    if (foto) {
      const caminho = '/uploads/' + foto.filename;
      const atual = await usuarioModel.buscarPorId(id);
      if (atual && atual.foto_perfil) apagarUpload(atual.foto_perfil);
      await usuarioModel.atualizarFoto(id, caminho);
      req.session.usuario.foto_perfil = caminho;
    }

    req.session.flash = { sucesso: 'Perfil atualizado.' };
    res.redirect('/conta');
  } catch (err) {
    next(err);
  }
}

async function postRemoverFoto(req, res, next) {
  try {
    const id = req.session.usuario.id_usuario;
    const atual = await usuarioModel.buscarPorId(id);
    if (atual && atual.foto_perfil) apagarUpload(atual.foto_perfil);
    await usuarioModel.atualizarFoto(id, null);
    req.session.usuario.foto_perfil = null;
    req.session.flash = { sucesso: 'Foto de perfil removida.' };
    res.redirect('/conta');
  } catch (err) {
    next(err);
  }
}

// Define/limpa o "status do dia" (humor) mostrado no story.
async function postHumor(req, res, next) {
  try {
    const bruto = String(req.body.humor || '').trim();
    const humor = ehValido(bruto) ? bruto : null; // vazio/inválido => limpa
    await usuarioModel.atualizarHumor(req.session.usuario.id_usuario, humor);
    res.redirect(req.get('Referer') || '/feed');
  } catch (err) {
    next(err);
  }
}

module.exports = { getConta, postConta, postRemoverFoto, postHumor };
