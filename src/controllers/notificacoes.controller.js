'use strict';

const notificacaoService = require('../services/notificacao.service');
const tempoReal = require('../services/tempoReal.service');
const push = require('../services/push.service');

const FILTROS = [
  { chave: 'todas', rotulo: 'Todas' },
  { chave: 'nao-lidas', rotulo: 'Não lidas' },
  { chave: 'mensagens', rotulo: 'Mensagens' },
  { chave: 'social', rotulo: 'Mural' },
  { chave: 'aniversario', rotulo: 'Aniversários' },
];
const LIMITE_PAGINA = 30;

function filtroValido(f) {
  return FILTROS.some((x) => x.chave === f) ? f : 'todas';
}

function ehFetch(req) {
  return (req.get('x-requested-with') || '') === 'fetch' || req.is('application/json');
}

function idsDe(valor) {
  return String(valor || '').split(',').map((x) => parseInt(x, 10)).filter((x) => x > 0);
}

// "aaaa-mm-dd" no fuso da aplicação (process.env.TZ já é o fuso do sistema).
function diaLocal(d) {
  return d.toLocaleDateString('en-CA');
}

// Separa em seções por dia: Hoje / Ontem / Esta semana / Anteriores.
function secionar(itens) {
  const agora = new Date();
  const hoje = diaLocal(agora);
  const ontem = diaLocal(new Date(agora.getTime() - 86400000));
  const limiteSemana = agora.getTime() - 7 * 86400000;
  const grupos = { Hoje: [], Ontem: [], 'Esta semana': [], Anteriores: [] };
  for (const n of itens) {
    const d = new Date(n.criado_em);
    const dia = diaLocal(d);
    if (dia === hoje) grupos.Hoje.push(n);
    else if (dia === ontem) grupos.Ontem.push(n);
    else if (d.getTime() > limiteSemana) grupos['Esta semana'].push(n);
    else grupos.Anteriores.push(n);
  }
  return Object.keys(grupos).filter((k) => grupos[k].length).map((k) => ({ rotulo: k, itens: grupos[k] }));
}

// Página completa de notificações (abas por tipo, seções por dia, paginação).
async function getPagina(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const filtro = filtroValido(req.query.filtro);
    const { itens, temMais, ultimaId } = await notificacaoService.listar(me, { limite: LIMITE_PAGINA, filtro });
    // Abrir a central conta como "vi tudo" — exceto na aba "Não lidas", onde a pessoa
    // trabalha item por item (cada clique marca o seu).
    if (filtro !== 'nao-lidas') await notificacaoService.marcarTodasLidas(me);
    res.render('notificacoes/index', {
      titulo: 'Notificações',
      pagina: 'notificacoes',
      filtro,
      filtros: FILTROS.map((f) => Object.assign({ ativo: f.chave === filtro }, f)),
      secoes: secionar(itens),
      vazia: !itens.length,
      temMais,
      ultimaId,
    });
  } catch (err) {
    next(err);
  }
}

// Página seguinte (JSON): itens mais antigos que "antes", já agrupados.
async function lista(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const filtro = filtroValido(req.query.filtro);
    const antesDe = parseInt(req.query.antes, 10) || 0;
    const r = await notificacaoService.listar(me, { limite: LIMITE_PAGINA, filtro, antesDe });
    res.json(r);
  } catch (err) {
    next(err);
  }
}

// Abre uma notificação: marca como lida (e as irmãs do grupo) e leva ao destino.
async function abrir(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const extras = idsDe(req.query.ids).filter((x) => x !== Number(req.params.id));
    const r = await notificacaoService.marcarLida(Number(req.params.id), me, extras);
    res.redirect(r && r.link ? r.link : '/notificacoes');
  } catch (err) {
    next(err);
  }
}

// Marca uma (ou o grupo) como lida sem sair da página (AJAX).
async function ler(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const extras = idsDe(req.body && req.body.ids).filter((x) => x !== Number(req.params.id));
    await notificacaoService.marcarLida(Number(req.params.id), me, extras);
    res.json({ ok: true, count: await notificacaoService.contarNaoLidas(me) });
  } catch (err) {
    next(err);
  }
}

// Tempo real: fluxo SSE com as notificações novas e a contagem.
function stream(req, res) {
  const me = req.session.usuario.id_usuario;
  tempoReal.inscrever(me, req, res);
  notificacaoService.contarNaoLidas(me)
    .then((count) => tempoReal.publicar(me, 'contagem', { count }))
    .catch(() => {});
}

// Polling de reserva (quando o SSE não está disponível): novas desde "ultima" + contagem.
async function novas(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const ultima = Number(req.query.ultima) || 0;
    const [count, itens] = await Promise.all([
      notificacaoService.contarNaoLidas(me),
      notificacaoService.listarBrutas(me, 8),
    ]);
    const lista2 = itens.filter((n) => n.id > ultima);
    res.json({ count, ultima: itens[0] ? itens[0].id : ultima, novas: lista2 });
  } catch (err) {
    next(err);
  }
}

// Marca todas como lidas (AJAX ou form).
async function lerTodas(req, res, next) {
  try {
    await notificacaoService.marcarTodasLidas(req.session.usuario.id_usuario);
    if (ehFetch(req)) return res.json({ ok: true, count: 0 });
    res.redirect(req.get('Referer') || '/notificacoes');
  } catch (err) {
    next(err);
  }
}

// Remove uma notificação (ou o grupo inteiro).
async function excluir(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const ids = idsDe(req.body && req.body.ids);
    const id = Number(req.params.id);
    if (id && !ids.includes(id)) ids.push(id);
    const n = await notificacaoService.excluir(ids, me);
    if (ehFetch(req)) return res.json({ ok: true, removidas: n, count: await notificacaoService.contarNaoLidas(me) });
    res.redirect('/notificacoes');
  } catch (err) {
    next(err);
  }
}

// Limpa tudo.
async function limpar(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const n = await notificacaoService.excluirTodas(me);
    if (ehFetch(req)) return res.json({ ok: true, removidas: n, count: 0 });
    req.session.flash = { sucesso: 'Notificações limpas.' };
    res.redirect('/notificacoes');
  } catch (err) {
    next(err);
  }
}

// Preferências + estado do push neste usuário.
async function getPreferencias(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const prefs = await notificacaoService.buscarPrefs(me);
    const disponivel = push.disponivel();
    res.json({
      prefs,
      push: { disponivel, chave: disponivel ? await push.chavePublica() : null },
    });
  } catch (err) {
    next(err);
  }
}

async function salvarPreferencias(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const prefs = await notificacaoService.salvarPrefs(me, req.body || {});
    res.json({ ok: true, prefs });
  } catch (err) {
    next(err);
  }
}

// Push: registra/cancela a inscrição deste navegador.
async function pushInscrever(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    const ok = await push.inscrever(me, req.body && req.body.subscription, req.get('user-agent'));
    res.status(ok ? 200 : 400).json({ ok });
  } catch (err) {
    next(err);
  }
}

async function pushCancelar(req, res, next) {
  try {
    const me = req.session.usuario.id_usuario;
    await push.cancelar(me, req.body && req.body.endpoint);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// Dispara uma notificação de teste para o próprio usuário (valida som/toast/push).
async function testar(req, res, next) {
  try {
    const n = await notificacaoService.notificarTeste(req.session.usuario.id_usuario);
    res.json({ ok: !!n });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPagina, lista, abrir, ler, stream, novas, lerTodas, excluir, limpar,
  getPreferencias, salvarPreferencias, pushInscrever, pushCancelar, testar,
};
