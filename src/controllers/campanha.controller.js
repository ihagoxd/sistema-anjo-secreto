'use strict';

const campanhaService = require('../services/campanha.service');
const participanteService = require('../services/participante.service');
const usuarioModel = require('../models/usuario.model');
const { registrarLog } = require('../services/log.service');
const temaService = require('../services/tema.service');
const notificacaoService = require('../services/notificacao.service');
const avisoModel = require('../models/aviso.model');
const { porChave: temaPorChave } = require('../config/temas');

// O tema escolhido para a campanha passa a valer para todo mundo (igual a Admin → Tema da rede).
async function ativarTemaDaCampanha(req, chave, avisar) {
  const me = req.session.usuario;
  const r = await temaService.definir(String(chave || 'padrao'), me.nome);
  if (!r.ok || !r.mudou) return { mudou: false, tema: r.ok ? r.tema : null };
  await registrarLog({
    idUsuario: me.id_usuario, acao: 'TEMA_ALTERADO',
    descricao: `${r.anterior.emoji} ${r.anterior.nome} → ${r.tema.emoji} ${r.tema.nome} (pela campanha)`,
    entidade: 'tema', ip: req.ip,
  });
  if (avisar) {
    const ids = await avisoModel.idsDestinatarios(me.id_usuario);
    await notificacaoService.notificarTema(ids, r.tema);
  }
  return { mudou: true, tema: r.tema };
}

const MSG = {
  NOME: 'Dê um nome à campanha (mínimo 2 caracteres).',
  NAO_ENCONTRADA: 'Campanha não encontrada.',
  EM_ANDAMENTO: 'A campanha está em andamento — encerre antes de apagar.',
  ENCERRADA: 'Campanha encerrada não pode ser editada.',
  JA_ENCERRADA: 'Esta campanha já está encerrada.',
};

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// Sugestão do nome da campanha do mês (a brincadeira é mensal).
function sugestaoNome() {
  const d = new Date();
  const mes = MESES[d.getMonth()];
  return `Anjo Secreto · ${mes.charAt(0).toUpperCase() + mes.slice(1)} de ${d.getFullYear()}`;
}

function flash(req, tipo, msg) {
  req.session.flash = { [tipo]: msg };
}

async function getLista(req, res, next) {
  try {
    const campanhas = await campanhaService.listarCampanhas();
    // Campanha "em aberto" (rascunho ou em andamento): o botão de criar dá lugar ao atalho dela.
    const aberta = campanhas.find((c) => c.status !== 'ENCERRADA') || null;
    const temas = await temaService.listarParaAdmin();
    res.render('admin/campanhas', { titulo: 'Campanhas', campanhas, aberta, sugestao: sugestaoNome(), temas });
  } catch (err) {
    next(err);
  }
}

async function postCriar(req, res, next) {
  try {
    // Um clique: sem nome no corpo, a campanha nasce configurada com o nome do mês.
    const r = await campanhaService.criarCampanha({
      nome: req.body.nome || sugestaoNome(),
      descricao: req.body.descricao,
      tema: req.body.tema,
    });
    if (!r.ok) {
      if (r.motivo === 'JA_EXISTE') {
        flash(req, 'erro', `A campanha "${r.campanha.nome}" ainda está em aberto — encerre-a antes de criar a próxima.`);
        return res.redirect(`/admin/campanhas/${r.campanha.id_campanha}`);
      }
      flash(req, 'erro', MSG[r.motivo] || 'Não foi possível criar a campanha.');
      return res.redirect('/admin/campanhas');
    }
    await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'CAMPANHA_CRIADA', descricao: r.campanha.nome, entidade: 'campanha', idReferencia: r.campanha.id_campanha, ip: req.ip });
    // Tema escolhido para a rodada entra em vigor agora (se for diferente do atual)
    const t = await ativarTemaDaCampanha(req, r.campanha.tema, req.body.avisar === '1');
    flash(req, 'sucesso', `Campanha "${r.campanha.nome}" criada${t.mudou ? ` com o tema ${t.tema.emoji} ${t.tema.nome} ativado para todo mundo` : ''}.`);
    res.redirect(`/admin/campanhas/${r.campanha.id_campanha}`);
  } catch (err) {
    next(err);
  }
}

async function getDetalhe(req, res, next) {
  try {
    const campanha = await campanhaService.buscarCampanhaPorId(req.params.id_campanha);
    if (!campanha) {
      flash(req, 'erro', MSG.NAO_ENCONTRADA);
      return res.redirect('/admin/campanhas');
    }
    const [participantes, totalAptos, mensagens] = await Promise.all([
      participanteService.listarPorCampanha(campanha.id_campanha),
      usuarioModel.contarParticipantesAptos(),
      participanteService.resumoMensagens(campanha.id_campanha),
    ]);
    const ativos = participantes.filter((p) => p.ativo && p.usuario_ativo);
    // Quem saiu/foi inativado DEPOIS do sorteio: o anjo dessa pessoa ficou sem protegido
    // até o sorteio ser refeito. Em rascunho não importa (o sorteio ainda vai acontecer).
    const inativosComPar = campanha.status === 'EM_ANDAMENTO'
      ? participantes.filter((p) => (!p.ativo || !p.usuario_ativo) && p.tem_par) : [];
    // Quantos vão entrar no sorteio: se já sorteou, os participantes ativos gravados; senão, todos os aprovados.
    const totalNoSorteio = campanha.status === 'RASCUNHO' ? totalAptos : ativos.length;
    // Card "revelado" do fluxo sem JS (guardado na sessão pelo POST de revelar pessoa).
    let revelacao = null;
    if (req.session.revelacao && Number(req.session.revelacao.id_campanha) === Number(campanha.id_campanha)) {
      revelacao = req.session.revelacao;
    }
    delete req.session.revelacao;
    campanha.temaInfo = temaPorChave(campanha.tema) || null;
    // Campanha antiga sem tema gravado: o select vem com o tema em uso hoje
    campanha.temaSel = campanha.tema || (await temaService.ativo()).chave;
    const temas = await temaService.listarParaAdmin();
    res.render('admin/campanha', {
      titulo: campanha.nome,
      campanha,
      temas,
      participantes,
      totalParticipantes: participantes.length,
      totalAtivos: ativos.length,
      totalNoSorteio,
      inativosComPar,
      mensagens,
      revelacao,
      sorteada: campanha.status !== 'RASCUNHO',
      podeSortear: campanha.status === 'RASCUNHO' && totalAptos >= 3,
      faltam: Math.max(0, 3 - totalAptos),
    });
  } catch (err) {
    next(err);
  }
}

async function postEditar(req, res, next) {
  try {
    const r = await campanhaService.editarCampanha(req.params.id_campanha, { nome: req.body.nome, descricao: req.body.descricao, tema: req.body.tema });
    if (!r.ok) {
      flash(req, 'erro', MSG[r.motivo] || 'Não foi possível salvar.');
      return res.redirect(`/admin/campanhas/${req.params.id_campanha}`);
    }
    await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'CAMPANHA_EDITADA', descricao: r.campanha.nome, entidade: 'campanha', idReferencia: r.campanha.id_campanha, ip: req.ip });
    const t = req.body.tema ? await ativarTemaDaCampanha(req, r.campanha.tema, true) : { mudou: false };
    flash(req, 'sucesso', `Campanha atualizada${t.mudou ? `. Tema ${t.tema.emoji} ${t.tema.nome} ativado para todo mundo` : ''}.`);
    res.redirect(`/admin/campanhas/${req.params.id_campanha}`);
  } catch (err) {
    next(err);
  }
}

async function postEncerrar(req, res, next) {
  try {
    const r = await campanhaService.encerrarCampanha(req.params.id_campanha);
    if (r.ok) {
      await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'CAMPANHA_ENCERRADA', descricao: r.campanha.nome, entidade: 'campanha', idReferencia: r.campanha.id_campanha, ip: req.ip });
      // O tema era "durante a campanha": ao encerrar, a rede volta ao padrão (sem notificar ninguém)
      let voltou = false;
      const ativo = await temaService.ativo();
      if (r.campanha.tema && r.campanha.tema !== 'padrao' && ativo.chave === r.campanha.tema) {
        const v = await temaService.definir('padrao', req.session.usuario.nome);
        if (v.ok && v.mudou) {
          voltou = true;
          await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'TEMA_ALTERADO', descricao: `${v.anterior.emoji} ${v.anterior.nome} → ${v.tema.emoji} ${v.tema.nome} (campanha encerrada)`, entidade: 'tema', ip: req.ip });
        }
      }
      flash(req, 'sucesso', `Campanha "${r.campanha.nome}" encerrada.${voltou ? ' O tema da rede voltou ao padrão.' : ''}`);
    } else {
      flash(req, 'erro', MSG[r.motivo] || 'Não foi possível encerrar.');
    }
    res.redirect(`/admin/campanhas/${req.params.id_campanha}`);
  } catch (err) {
    next(err);
  }
}

async function postApagar(req, res, next) {
  try {
    const r = await campanhaService.apagarCampanha(req.params.id_campanha);
    if (r.ok) {
      await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'CAMPANHA_APAGADA', descricao: r.campanha.nome, entidade: 'campanha', idReferencia: r.campanha.id_campanha, ip: req.ip });
      flash(req, 'sucesso', `Campanha "${r.campanha.nome}" apagada.`);
    } else {
      flash(req, 'erro', MSG[r.motivo] || 'Não foi possível apagar.');
    }
    res.redirect('/admin/campanhas');
  } catch (err) {
    next(err);
  }
}

module.exports = { getLista, postCriar, getDetalhe, postEditar, postEncerrar, postApagar };
