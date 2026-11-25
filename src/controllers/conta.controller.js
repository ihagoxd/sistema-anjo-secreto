'use strict';

const usuarioModel = require('../models/usuario.model');
const { apagarUpload } = require('../config/upload');

const ehFetch = (req) => (req.get('x-requested-with') || '') === 'fetch';

async function getConta(req, res, next) {
  try {
    const u = await usuarioModel.buscarPorId(req.session.usuario.id_usuario);
    res.render('conta/editar', {
      titulo: 'Editar perfil',
      pagina: 'conta',
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

    // Só a foto (a tela troca a foto na hora, sem mexer nos outros campos)
    if (req.body.so_foto === '1') {
      if (!req.file) return res.status(400).json({ ok: false, erro: 'Escolha uma imagem.' });
      const caminho = '/uploads/' + req.file.filename;
      const atual = await usuarioModel.buscarPorId(id);
      if (atual && atual.foto_perfil) apagarUpload(atual.foto_perfil);
      await usuarioModel.atualizarFoto(id, caminho);
      req.session.usuario.foto_perfil = caminho;
      return res.json({ ok: true, foto_perfil: caminho });
    }

    const nome = String(req.body.nome || '').trim();
    if (nome.length < 2 && ehFetch(req)) return res.status(400).json({ ok: false, erro: 'O nome precisa ter pelo menos 2 letras.' });
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

    if (ehFetch(req)) return res.json({ ok: true, nome: req.session.usuario.nome, bio, data_nascimento: nascimento });
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
    if (ehFetch(req)) return res.json({ ok: true });
    req.session.flash = { sucesso: 'Foto de perfil removida.' };
    res.redirect('/conta');
  } catch (err) {
    next(err);
  }
}

// Nota (texto livre, até 60 caracteres, como no Instagram). "apagar" ou vazio limpa.
async function postNota(req, res, next) {
  try {
    let texto = Array.isArray(req.body.nota) ? req.body.nota[0] : req.body.nota;
    texto = String(texto || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    const nota = req.body.apagar ? null : (texto || null);
    await usuarioModel.atualizarNota(req.session.usuario.id_usuario, nota);
    res.redirect(req.get('Referer') || '/feed');
  } catch (err) {
    next(err);
  }
}

module.exports = { getConta, postConta, postRemoverFoto, postNota };
