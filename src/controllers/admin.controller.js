'use strict';

const usuarioService = require('../services/usuario.service');
const campanhaService = require('../services/campanha.service');
const sorteioService = require('../services/sorteio.service');
const usuarioModel = require('../models/usuario.model');
const participanteService = require('../services/participante.service');
const temaService = require('../services/tema.service');
const notificacaoService = require('../services/notificacao.service');
const avisoModel = require('../models/aviso.model');
const { registrarLog, listarLogs, listarAcoes } = require('../services/log.service');
const { responder, renderizar, ehFetch } = require('../utils/responder');
const { fuso } = require('../config/fuso');
const { linhaAtualizada, paraLinha } = require('./usuario.controller');

// Volta para a página de onde a ação partiu (lista de usuários com filtro, ou aprovações).
function voltarDe(req, padrao) {
  const ref = req.get('Referer') || '';
  const m = /\/admin\/(usuarios|aprovacoes)(\?[^#]*)?$/.exec(ref);
  return m ? `/admin/${m[1]}${m[2] || ''}` : padrao;
}

async function getDashboard(req, res, next) {
  try {
    const [resumo, aptos, admins, campanhas, inativos, logs, temaAtivo] = await Promise.all([
      usuarioService.contarResumo(),
      usuarioModel.contarParticipantesAptos(),
      usuarioModel.contarAdminsAtivos(),
      campanhaService.listarCampanhas(),
      usuarioModel.inativosNaCampanhaAtiva(),
      listarLogs(8),
      temaService.ativo(),
    ]);
    // Tema com aba extra (Mês das Crianças): quantos já contaram o que querem ganhar.
    const temaPreenchidos = temaAtivo.temPrefs ? await temaService.contarPreenchidos(temaAtivo) : 0;
    const campanhaAtiva = campanhas.find((c) => c.status === 'EM_ANDAMENTO') || null;
    const rascunho = campanhas.find((c) => c.status === 'RASCUNHO') || null;
    let mensagens = null;
    let participantesAtivos = 0;
    if (campanhaAtiva) {
      [mensagens, participantesAtivos] = await Promise.all([
        participanteService.resumoMensagens(campanhaAtiva.id_campanha),
        campanhaService.contarParticipantes(campanhaAtiva.id_campanha),
      ]);
    }
    // O que precisa de atenção (cada item vira um aviso clicável no topo do painel).
    const atencao = [];
    if (resumo.pendentes) atencao.push({ tipo: 'alerta', texto: `${resumo.pendentes} cadastro${resumo.pendentes > 1 ? 's' : ''} aguardando aprovação`, link: '/admin/aprovacoes', acao: 'Aprovar' });
    if (inativos.length) atencao.push({ tipo: 'alerta', texto: `${inativos.length} pessoa${inativos.length > 1 ? 's' : ''} do sorteio em andamento ${inativos.length > 1 ? 'estão inativas' : 'está inativa'} (${inativos.map((i) => i.nome).join(', ')}) — o anjo ficou sem protegido`, link: `/admin/campanhas/${inativos[0].id_campanha}`, acao: 'Ver campanha' });
    if (admins <= 1) atencao.push({ tipo: 'info', texto: 'Só existe 1 administrador ativo. Crie um segundo para não ficar sem acesso se esquecer a senha', link: '/admin/usuarios?f=admins', acao: 'Usuários' });
    if (rascunho && !campanhaAtiva) atencao.push({ tipo: 'info', texto: `A campanha "${rascunho.nome}" está pronta para o sorteio (${aptos} pessoa${aptos === 1 ? '' : 's'} apta${aptos === 1 ? '' : 's'})`, link: `/admin/campanhas/${rascunho.id_campanha}`, acao: 'Sortear' });
    res.render('admin/dashboard', {
      titulo: 'Painel',
      resumo, aptos, admins, atencao,
      pendentes: resumo.pendentes,
      totalUsuarios: resumo.todos,
      totalCampanhas: campanhas.length,
      campanhaAtiva, rascunho, mensagens, participantesAtivos, inativos,
      logs,
      temaAtivo, temaPreenchidos,
    });
  } catch (err) {
    next(err);
  }
}

// ---------- Tema da rede social ----------
// GET: cards de cada tema (com prévia) e qual está em uso. POST: ativa um tema para todos.
async function getTema(req, res, next) {
  try {
    const [temas, atual, aptos] = await Promise.all([
      temaService.listarParaAdmin(),
      temaService.ativo(),
      usuarioModel.contarParticipantesAptos(),
    ]);
    const preenchidos = atual.temPrefs ? await temaService.contarPreenchidos(atual) : 0;
    res.render('admin/tema', {
      titulo: 'Tema da rede social',
      pagina: 'admin-tema',
      temas, atual, aptos, preenchidos,
    });
  } catch (err) {
    next(err);
  }
}

async function postTema(req, res, next) {
  try {
    const me = req.session.usuario;
    const r = await temaService.definir(String(req.body.tema || ''), me.nome);
    if (!r.ok) {
      req.session.flash = { erro: 'Tema inválido.' };
      return res.redirect('/admin/tema');
    }
    if (!r.mudou) {
      req.session.flash = { sucesso: `O tema "${r.tema.nome}" já estava em uso.` };
      return res.redirect('/admin/tema');
    }
    await registrarLog({
      idUsuario: me.id_usuario, acao: 'TEMA_ALTERADO',
      descricao: `${r.anterior.nome} → ${r.tema.nome}`,
      entidade: 'tema', ip: req.ip,
    });
    // Avisa todo mundo (sino + push) — opcional, marcado por padrão no formulário.
    let avisados = 0;
    if (req.body.avisar === '1') {
      const ids = await avisoModel.idsDestinatarios(me.id_usuario);
      await notificacaoService.notificarTema(ids, r.tema);
      avisados = ids.length;
    }
    req.session.flash = {
      sucesso: `Tema "${r.tema.nome}" ativado! A rede inteira já está com o visual novo${avisados ? ` e ${avisados} pessoa${avisados > 1 ? 's foram avisadas' : ' foi avisada'}` : ''}.`,
    };
    res.redirect('/admin/tema');
  } catch (err) {
    next(err);
  }
}

async function getAprovacoes(req, res, next) {
  try {
    const pendentes = await usuarioService.listarPendentes();
    res.render('admin/aprovacoes', { titulo: 'Aprovações', pendentes: pendentes.map((u) => paraLinha(u, req.session.usuario.id_usuario)) });
  } catch (err) {
    next(err);
  }
}

async function postAprovar(req, res, next) {
  try {
    const r = await usuarioService.aprovarCadastro(req.params.id_usuario);
    if (!r.ok) return responder(req, res, { ok: false, erro: r.motivo === 'JA_APROVADO' ? 'Esse cadastro já estava aprovado.' : 'Cadastro não pôde ser aprovado.', destino: voltarDe(req, '/admin/aprovacoes') });
    await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'CADASTRO_APROVADO', descricao: `usuario: ${r.usuario.usuario}${r.reaprovado ? ' (estava recusado)' : ''}`, entidade: 'usuario', idReferencia: r.usuario.id_usuario, ip: req.ip });
    const aviso = r.usuario.ativo ? null : 'A pessoa está inativa: reative para ela conseguir entrar.';
    responder(req, res, {
      msg: `${r.usuario.nome} foi aprovado(a)`,
      flash: `Cadastro de "${r.usuario.nome}" aprovado. ${r.usuario.ativo ? 'A pessoa já pode entrar.' : 'A pessoa está inativa — ative-a para conseguir entrar.'}`,
      destino: voltarDe(req, '/admin/aprovacoes'),
      dados: { aviso, ...(await linhaAtualizada(req, res, r.usuario.id_usuario)) },
    });
  } catch (err) {
    next(err);
  }
}

async function postRecusar(req, res, next) {
  try {
    const r = await usuarioService.recusarCadastro(req.params.id_usuario);
    if (!r.ok) return responder(req, res, { ok: false, erro: 'Cadastro não pôde ser recusado (só cadastros pendentes podem ser recusados).', destino: voltarDe(req, '/admin/aprovacoes') });
    await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'CADASTRO_RECUSADO', descricao: `usuario: ${r.usuario.usuario}`, entidade: 'usuario', idReferencia: r.usuario.id_usuario, ip: req.ip });
    responder(req, res, {
      msg: `Cadastro de ${r.usuario.nome} recusado`,
      flash: `Cadastro de "${r.usuario.nome}" recusado. Se foi engano, dá para aprovar depois na lista de usuários (filtro "Recusados").`,
      destino: voltarDe(req, '/admin/aprovacoes'),
      dados: await linhaAtualizada(req, res, r.usuario.id_usuario),
    });
  } catch (err) {
    next(err);
  }
}

// ---------- Logs (auditoria) ----------
const LOGS_POR_PAGINA = 40;
// Logs separados por dia, como a atividade do Instagram: o primeiro registro de cada dia leva o título
// ("Hoje", "Ontem", "25 de novembro"). Num "carregar mais", o ui.js tira o título se o dia continua o anterior.
function marcarDias(logs) {
  const diaDe = (d) => d.toLocaleDateString('en-CA', { timeZone: fuso });
  const hoje = diaDe(new Date()), ontem = diaDe(new Date(Date.now() - 86400000));
  let anterior = null;
  return logs.map((l) => {
    const d = new Date(l.criado_em);
    if (Number.isNaN(d.getTime())) return l;
    const dia = diaDe(d);
    if (dia === anterior) return l;
    anterior = dia;
    const outroAno = dia.slice(0, 4) !== hoje.slice(0, 4);
    const diaTitulo = dia === hoje ? 'Hoje' : dia === ontem ? 'Ontem'
      : d.toLocaleDateString('pt-BR', { timeZone: fuso, day: 'numeric', month: 'long', ...(outroAno ? { year: 'numeric' } : {}) });
    return { ...l, dia, diaTitulo };
  });
}
async function getLogs(req, res, next) {
  try {
    const acao = String(req.query.acao || '').trim().toUpperCase();
    const q = String(req.query.q || '').trim();
    const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1);
    const [brutos, acoes] = await Promise.all([
      listarLogs({ limite: LOGS_POR_PAGINA, offset: (pagina - 1) * LOGS_POR_PAGINA, acao: acao || null, q: q || null }),
      listarAcoes(),
    ]);
    const logs = marcarDias(brutos);
    const total = logs.length ? logs[0].total : 0;
    const paginas = Math.max(1, Math.ceil(total / LOGS_POR_PAGINA));
    const base = `/admin/logs?acao=${encodeURIComponent(acao)}&q=${encodeURIComponent(q)}`;
    // Tela fluida: filtro, busca e "carregar mais" pedem só os itens (HTML pronto) por fetch
    if (ehFetch(req)) {
      const html = await renderizar(res, 'partials/admLogItens', { logs, filtrando: !!(acao || q) });
      return res.json({ ok: true, html, total, pagina, proxima: pagina < paginas });
    }
    res.render('admin/logs', {
      titulo: 'Logs do sistema',
      logs, total, acao, q, pagina, paginas,
      filtrando: !!(acao || q),
      acoes: acoes.map((a) => ({ ...a, sel: a.acao === acao })),
      anterior: pagina > 1 ? `${base}&pagina=${pagina - 1}` : null,
      proxima: pagina < paginas ? `${base}&pagina=${pagina + 1}` : null,
      de: total ? (pagina - 1) * LOGS_POR_PAGINA + 1 : 0,
      ate: Math.min(pagina * LOGS_POR_PAGINA, total),
    });
  } catch (err) {
    next(err);
  }
}

// ---------- Tela emergencial: revelar o sorteio ----------
// GET mostra o aviso/confirmação; POST revela os pares e REGISTRA LOG obrigatório.
async function getRevelar(req, res, next) {
  try {
    const campanha = await campanhaService.buscarCampanhaPorId(req.params.id_campanha);
    if (!campanha) {
      req.session.flash = { erro: 'Campanha não encontrada.' };
      return res.redirect('/admin/campanhas');
    }
    const realizado = await sorteioService.verificarSorteioRealizado(campanha.id_campanha);
    res.render('admin/revelarConfirma', { titulo: 'Revelar sorteio', pagina: 'adm-cp', campanha, realizado });
  } catch (err) {
    next(err);
  }
}

// Revela UMA pessoa: quem é o anjo dela e de quem ela é anjo. Registra log com o nome
// de quem foi revelado. Via fetch devolve JSON (o card abre na própria página); sem JS,
// guarda na sessão e volta para a campanha, que mostra o card uma vez.
async function postRevelarPessoa(req, res, next) {
  try {
    const viaFetch = (req.get('x-requested-with') || '') === 'fetch';
    const campanha = await campanhaService.buscarCampanhaPorId(req.params.id_campanha);
    const pessoa = campanha ? await usuarioModel.buscarPorId(req.params.id_usuario) : null;
    if (!campanha || !pessoa) {
      if (viaFetch) return res.status(404).json({ ok: false, erro: 'Campanha ou pessoa não encontrada.' });
      req.session.flash = { erro: 'Campanha ou pessoa não encontrada.' };
      return res.redirect('/admin/campanhas');
    }
    const [anjo, protegido] = await Promise.all([
      sorteioService.buscarAnjoDoProtegido(campanha.id_campanha, pessoa.id_usuario),
      sorteioService.buscarProtegidoDoAnjo(campanha.id_campanha, pessoa.id_usuario),
    ]);
    if (!anjo && !protegido) {
      const erro = `${pessoa.nome} não está em nenhum par desta campanha (entrou depois do sorteio ou está inativa).`;
      if (viaFetch) return res.status(400).json({ ok: false, erro });
      req.session.flash = { erro };
      return res.redirect(`/admin/campanhas/${campanha.id_campanha}`);
    }
    // Registro OBRIGATÓRIO: quem revelou, quem foi revelado, quando e qual campanha.
    await registrarLog({
      idUsuario: req.session.usuario.id_usuario,
      acao: 'ANJO_REVELADO',
      descricao: `Revelou o par de "${pessoa.nome}" (@${pessoa.usuario}) na campanha "${campanha.nome}"`,
      entidade: 'campanha',
      idReferencia: campanha.id_campanha,
      ip: req.ip,
    });
    const resumo = (u) => (u ? { id_usuario: u.id_usuario, nome: u.nome, usuario: u.usuario, foto_perfil: u.foto_perfil || null } : null);
    const revelacao = { pessoa: resumo(pessoa), anjo: resumo(anjo), protegido: resumo(protegido) };
    if (viaFetch) return res.json({ ok: true, ...revelacao });
    req.session.revelacao = { id_campanha: campanha.id_campanha, ...revelacao };
    res.redirect(`/admin/campanhas/${campanha.id_campanha}`);
  } catch (err) {
    next(err);
  }
}

async function postRevelar(req, res, next) {
  try {
    const campanha = await campanhaService.buscarCampanhaPorId(req.params.id_campanha);
    if (!campanha) {
      req.session.flash = { erro: 'Campanha não encontrada.' };
      return res.redirect('/admin/campanhas');
    }
    const pares = await sorteioService.listarPares(campanha.id_campanha);
    // Registro OBRIGATÓRIO: quem revelou, quando e qual campanha.
    await registrarLog({
      idUsuario: req.session.usuario.id_usuario,
      acao: 'SORTEIO_REVELADO',
      descricao: `Revelou os pares da campanha "${campanha.nome}"`,
      entidade: 'campanha',
      idReferencia: campanha.id_campanha,
      ip: req.ip,
    });
    // Esta tela sai direto da resposta do POST (não é página aberta por link) e o middleware do tema só roda
    // em GET: carrega o tema aqui, senão a lista abria sem a cara da rede (sem classe no body nem CSS do tema)
    res.locals.tema = await temaService.ativo();
    res.render('admin/revelar', { titulo: 'Sorteio revelado', pagina: 'adm-cp', campanha, pares });
  } catch (err) {
    next(err);
  }
}

module.exports = { getDashboard, getAprovacoes, postAprovar, postRecusar, getLogs, getRevelar, postRevelar, postRevelarPessoa, getTema, postTema };
