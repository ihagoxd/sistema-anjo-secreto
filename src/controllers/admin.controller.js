'use strict';

const usuarioService = require('../services/usuario.service');
const campanhaService = require('../services/campanha.service');
const sorteioService = require('../services/sorteio.service');
const usuarioModel = require('../models/usuario.model');
const participanteService = require('../services/participante.service');
const { registrarLog, listarLogs, listarAcoes } = require('../services/log.service');

// Volta para a página de onde a ação partiu (lista de usuários com filtro, ou aprovações).
function voltarDe(req, padrao) {
  const ref = req.get('Referer') || '';
  const m = /\/admin\/(usuarios|aprovacoes)(\?[^#]*)?$/.exec(ref);
  return m ? `/admin/${m[1]}${m[2] || ''}` : padrao;
}

async function getDashboard(req, res, next) {
  try {
    const [resumo, aptos, admins, campanhas, inativos, logs] = await Promise.all([
      usuarioService.contarResumo(),
      usuarioModel.contarParticipantesAptos(),
      usuarioModel.contarAdminsAtivos(),
      campanhaService.listarCampanhas(),
      usuarioModel.inativosNaCampanhaAtiva(),
      listarLogs(8),
    ]);
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
    });
  } catch (err) {
    next(err);
  }
}

async function getAprovacoes(req, res, next) {
  try {
    const pendentes = await usuarioService.listarPendentes();
    res.render('admin/aprovacoes', { titulo: 'Aprovações', pendentes });
  } catch (err) {
    next(err);
  }
}

async function postAprovar(req, res, next) {
  try {
    const r = await usuarioService.aprovarCadastro(req.params.id_usuario);
    if (r.ok) {
      await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'CADASTRO_APROVADO', descricao: `usuario: ${r.usuario.usuario}${r.reaprovado ? ' (estava recusado)' : ''}`, entidade: 'usuario', idReferencia: r.usuario.id_usuario, ip: req.ip });
      req.session.flash = { sucesso: `Cadastro de "${r.usuario.nome}" aprovado. ${r.usuario.ativo ? 'A pessoa já pode entrar.' : 'A pessoa está inativa — ative-a para conseguir entrar.'}` };
    } else {
      req.session.flash = { erro: r.motivo === 'JA_APROVADO' ? 'Esse cadastro já estava aprovado.' : 'Cadastro não pôde ser aprovado.' };
    }
    res.redirect(voltarDe(req, '/admin/aprovacoes'));
  } catch (err) {
    next(err);
  }
}

async function postRecusar(req, res, next) {
  try {
    const r = await usuarioService.recusarCadastro(req.params.id_usuario);
    if (r.ok) {
      await registrarLog({ idUsuario: req.session.usuario.id_usuario, acao: 'CADASTRO_RECUSADO', descricao: `usuario: ${r.usuario.usuario}`, entidade: 'usuario', idReferencia: r.usuario.id_usuario, ip: req.ip });
      req.session.flash = { sucesso: `Cadastro de "${r.usuario.nome}" recusado. Se foi engano, dá para aprovar depois na lista de usuários (filtro "Recusados").` };
    } else {
      req.session.flash = { erro: 'Cadastro não pôde ser recusado (só cadastros pendentes podem ser recusados).' };
    }
    res.redirect(voltarDe(req, '/admin/aprovacoes'));
  } catch (err) {
    next(err);
  }
}

// ---------- Logs (auditoria) ----------
const LOGS_POR_PAGINA = 100;
async function getLogs(req, res, next) {
  try {
    const acao = String(req.query.acao || '').trim().toUpperCase();
    const q = String(req.query.q || '').trim();
    const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1);
    const [logs, acoes] = await Promise.all([
      listarLogs({ limite: LOGS_POR_PAGINA, offset: (pagina - 1) * LOGS_POR_PAGINA, acao: acao || null, q: q || null }),
      listarAcoes(),
    ]);
    const total = logs.length ? logs[0].total : 0;
    const paginas = Math.max(1, Math.ceil(total / LOGS_POR_PAGINA));
    const base = `/admin/logs?acao=${encodeURIComponent(acao)}&q=${encodeURIComponent(q)}`;
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
    res.render('admin/revelarConfirma', { titulo: 'Revelar sorteio', campanha, realizado });
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
    res.render('admin/revelar', { titulo: 'Sorteio revelado', campanha, pares });
  } catch (err) {
    next(err);
  }
}

module.exports = { getDashboard, getAprovacoes, postAprovar, postRecusar, getLogs, getRevelar, postRevelar, postRevelarPessoa };
