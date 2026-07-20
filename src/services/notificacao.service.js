'use strict';

/**
 * Notificações do sistema.
 * As funções "notificar*" NUNCA lançam (uma falha aqui não pode quebrar
 * o envio de mensagem / curtida / etc.) — apenas registram no console.
 *
 * ANONIMATO: mensagens do canal do jogo entram SEM ator (id_ator NULL) e com
 * texto genérico ("Seu anjo" / "Seu protegido"), nunca revelando quem é o anjo.
 */
const notificacaoModel = require('../models/notificacao.model');

// Texto + ícone por tipo. temAtor = mostra avatar/nome de quem gerou.
function montarTexto(row) {
  const nome = row.ator_nome || 'Alguém';
  switch (row.tipo) {
    case 'MENSAGEM':            return { emoji: '💬', temAtor: true,  texto: `${nome} te mandou uma mensagem` };
    case 'MENSAGEM_ANJO':       return { emoji: '😇', temAtor: false, texto: 'Seu anjo te mandou uma mensagem' };
    case 'MENSAGEM_PROTEGIDO':  return { emoji: '🎁', temAtor: false, texto: 'Seu protegido te mandou uma mensagem' };
    case 'CURTIDA':             return { emoji: '❤️', temAtor: true,  texto: `${nome} curtiu seu post` };
    case 'COMENTARIO':          return { emoji: '💭', temAtor: true,  texto: `${nome} comentou no seu post` };
    case 'REPOST':              return { emoji: '🔁', temAtor: true,  texto: `${nome} repostou seu post` };
    case 'MENCAO':              return { emoji: '📣', temAtor: true,  texto: `${nome} mencionou você` };
    case 'ANIVERSARIO':         return { emoji: '🎂', temAtor: true,  texto: `Hoje é aniversário de ${nome}! Mande os parabéns 🎉` };
    default:                    return { emoji: '🔔', temAtor: !!row.ator_nome, texto: nome };
  }
}

function renderizar(row) {
  const m = montarTexto(row);
  return {
    id: row.id_notificacao,
    tipo: row.tipo,
    emoji: m.emoji,
    texto: m.texto,
    temAtor: m.temAtor && !!row.ator_nome,
    ator_nome: row.ator_nome,
    ator_foto: row.ator_foto,
    link: row.link || '/notificacoes',
    lida: row.lida,
    criado_em: row.criado_em,
  };
}

async function listar(idUsuario, limite = 30) {
  const rows = await notificacaoModel.listar(idUsuario, limite);
  return rows.map(renderizar);
}

function contarNaoLidas(idUsuario) {
  return notificacaoModel.contarNaoLidas(idUsuario);
}

function marcarLida(idNotificacao, idUsuario) {
  return notificacaoModel.marcarLida(idNotificacao, idUsuario);
}

function marcarTodasLidas(idUsuario) {
  return notificacaoModel.marcarTodasLidas(idUsuario);
}

// ---------- Geradores (à prova de falha) ----------
async function seguro(fn) {
  try { await fn(); } catch (e) { console.error('[notificacao]', e.message); }
}

function notificarMensagemDireta(idDestino, idRemetente) {
  return seguro(() => notificacaoModel.inserir({
    idUsuario: idDestino, tipo: 'MENSAGEM', idAtor: idRemetente, link: '/mensagens/u/' + idRemetente,
  }));
}

// alvo recebido: 'protegido' => o destino é o PROTEGIDO (recebeu do anjo, anônimo)
//                'anjo'      => o destino é o ANJO      (recebeu do protegido)
function notificarMensagemJogo(idDestino, alvo) {
  const tipo = alvo === 'protegido' ? 'MENSAGEM_ANJO' : 'MENSAGEM_PROTEGIDO';
  const link = alvo === 'protegido' ? '/mensagens/anjo' : '/mensagens/protegido';
  return seguro(() => notificacaoModel.inserir({ idUsuario: idDestino, tipo, idAtor: null, link }));
}

function notificarCurtida(idDono, idAtor, idPost) {
  if (idDono === idAtor) return Promise.resolve();
  return seguro(() => notificacaoModel.inserir({
    idUsuario: idDono, tipo: 'CURTIDA', idAtor, link: '/p/' + idPost, ref: idPost,
  }));
}

function notificarComentario(idDono, idAtor, idPost) {
  if (idDono === idAtor) return Promise.resolve();
  return seguro(() => notificacaoModel.inserir({
    idUsuario: idDono, tipo: 'COMENTARIO', idAtor, link: '/p/' + idPost, ref: idPost,
  }));
}

function notificarRepost(idDono, idAtor, idPost) {
  if (idDono === idAtor) return Promise.resolve();
  return seguro(() => notificacaoModel.inserir({
    idUsuario: idDono, tipo: 'REPOST', idAtor, link: '/p/' + idPost, ref: idPost,
  }));
}

function notificarMencao(idDestino, idAtor, idPost) {
  if (idDestino === idAtor) return Promise.resolve();
  return seguro(() => notificacaoModel.inserir({
    idUsuario: idDestino, tipo: 'MENCAO', idAtor, link: '/p/' + idPost, ref: idPost,
  }));
}

// Gera (1x por dia) uma notificação de aniversário para "idUsuario" sobre cada aniversariante (menos ele).
async function gerarAniversarios(idUsuario, aniversariantes) {
  for (const a of aniversariantes) {
    if (a.id_usuario === idUsuario) continue;
    await seguro(async () => {
      const jaTem = await notificacaoModel.existeHoje(idUsuario, 'ANIVERSARIO', a.id_usuario);
      if (!jaTem) {
        await notificacaoModel.inserir({
          idUsuario, tipo: 'ANIVERSARIO', idAtor: a.id_usuario, link: '/u/' + a.usuario,
        });
      }
    });
  }
}

module.exports = {
  listar,
  contarNaoLidas,
  marcarLida,
  marcarTodasLidas,
  notificarMensagemDireta,
  notificarMensagemJogo,
  notificarCurtida,
  notificarComentario,
  notificarRepost,
  notificarMencao,
  gerarAniversarios,
};
