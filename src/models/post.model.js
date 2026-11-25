'use strict';

/**
 * Acesso ao banco do Mural: posts, curtidas e comentários.
 */
const db = require('../config/db');

const SELECT_POST = `
  SELECT p.id_post, p.texto, p.imagem, p.video, p.video_poster, p.criado_em, p.editado_em, p.presente_anjo, p.local,
         u.id_usuario, u.nome, u.usuario, u.foto_perfil,
         (SELECT COALESCE(json_agg(pm.caminho ORDER BY pm.ordem, pm.id_midia), '[]'::json)
            FROM post_midias pm WHERE pm.id_post = p.id_post) AS midias,
         (SELECT c3.reacao FROM post_curtidas c3 WHERE c3.id_post = p.id_post AND c3.id_usuario = $1) AS minha_reacao,
         (SELECT array_agg(t.reacao ORDER BY t.n DESC, t.reacao)
            FROM (SELECT reacao, COUNT(*) AS n FROM post_curtidas c4 WHERE c4.id_post = p.id_post GROUP BY reacao ORDER BY n DESC LIMIT 3) t) AS reacoes_top,
         EXISTS(SELECT 1 FROM post_salvos ps WHERE ps.id_post = p.id_post AND ps.id_usuario = $1) AS salvei,
         uc.id_usuario AS id_colaborador, uc.usuario AS usuario_colab, uc.nome AS nome_colab,
         (SELECT array_agg(u3.usuario ORDER BY u3.usuario)
            FROM post_colaboradores pc JOIN usuarios u3 ON u3.id_usuario = pc.id_usuario
           WHERE pc.id_post = p.id_post) AS colaboradores,
         (SELECT COUNT(*) FROM post_curtidas c WHERE c.id_post = p.id_post)::int AS curtidas,
         (SELECT u2.usuario FROM post_curtidas c2 JOIN usuarios u2 ON u2.id_usuario = c2.id_usuario
           WHERE c2.id_post = p.id_post ORDER BY (c2.id_usuario = $1) ASC, c2.criado_em DESC LIMIT 1) AS curtidor,
         -- até 3 curtidores para as fotinhas da linha "Curtido por" (os outros antes de mim)
         (SELECT json_agg(json_build_object('usuario', x.usuario, 'nome', x.nome, 'foto', x.foto_perfil))
            FROM (SELECT u5.usuario, u5.nome, u5.foto_perfil FROM post_curtidas c5 JOIN usuarios u5 ON u5.id_usuario = c5.id_usuario
                   WHERE c5.id_post = p.id_post ORDER BY (c5.id_usuario = $1) ASC, c5.criado_em DESC LIMIT 3) x) AS curtidores,
         (SELECT COUNT(*) FROM post_comentarios m WHERE m.id_post = p.id_post)::int AS comentarios,
         (SELECT COUNT(*) FROM reposts r WHERE r.id_post = p.id_post)::int AS reposts,
         EXISTS(SELECT 1 FROM post_curtidas c WHERE c.id_post = p.id_post AND c.id_usuario = $1) AS curtiu,
         EXISTS(SELECT 1 FROM reposts r WHERE r.id_post = p.id_post AND r.id_usuario = $1) AS repostou,
         p.enquete_multipla, p.enquete_pergunta,
         EXISTS(SELECT 1 FROM enquete_opcoes o WHERE o.id_post = p.id_post) AS tem_enquete
    FROM posts p
    JOIN usuarios u ON u.id_usuario = p.id_usuario
    LEFT JOIN usuarios uc ON uc.id_usuario = p.id_colaborador`;

async function criar({ idUsuario, texto, imagem, video = null, idColaborador = null, enqueteMultipla = false, enquetePergunta = null, presenteAnjo = false, local = null }) {
  const res = await db.query(
    `INSERT INTO posts (id_usuario, texto, imagem, video, id_colaborador, enquete_multipla, enquete_pergunta, presente_anjo, local) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id_post`,
    [idUsuario, texto, imagem, video, idColaborador, !!enqueteMultipla, enquetePergunta, !!presenteAnjo, local]
  );
  return res.rows[0];
}

// Vídeo convertido/capa prontos (ffmpeg em segundo plano)
async function atualizarVideo(idPost, video, poster) {
  await db.query(`UPDATE posts SET video = $2, video_poster = $3 WHERE id_post = $1`, [idPost, video, poster || null]);
}

// ---------- Várias fotos (carrossel) ----------
async function adicionarMidias(idPost, caminhos) {
  for (let i = 0; i < caminhos.length; i++) {
    await db.query(`INSERT INTO post_midias (id_post, caminho, ordem) VALUES ($1, $2, $3)`, [idPost, caminhos[i], i]);
  }
}
async function listarMidias(idPost) {
  const res = await db.query(`SELECT caminho FROM post_midias WHERE id_post = $1 ORDER BY ordem, id_midia`, [idPost]);
  return res.rows.map((r) => r.caminho);
}

// ---------- Localização: sugestões (as minhas recentes + as mais usadas pela equipe) ----------
async function locaisSugeridos(idUsuario, limite = 8) {
  const res = await db.query(
    `SELECT local, MAX(criado_em) AS ultimo, COUNT(*) AS n, bool_or(id_usuario = $1) AS meu
       FROM posts WHERE local IS NOT NULL AND local <> ''
      GROUP BY local ORDER BY meu DESC, ultimo DESC LIMIT $2`,
    [idUsuario, limite]
  );
  return res.rows.map((r) => r.local);
}

// ---------- Salvos (marcador) ----------
async function salvar(idPost, idUsuario) {
  await db.query(`INSERT INTO post_salvos (id_post, id_usuario) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [idPost, idUsuario]);
}
async function dessalvar(idPost, idUsuario) {
  await db.query(`DELETE FROM post_salvos WHERE id_post = $1 AND id_usuario = $2`, [idPost, idUsuario]);
}
async function jaSalvou(idPost, idUsuario) {
  const res = await db.query(`SELECT 1 FROM post_salvos WHERE id_post = $1 AND id_usuario = $2`, [idPost, idUsuario]);
  return res.rowCount > 0;
}
async function listarSalvosPor(idUsuario) {
  const res = await db.query(
    `${SELECT_POST} JOIN post_salvos ps2 ON ps2.id_post = p.id_post AND ps2.id_usuario = $1 ORDER BY ps2.criado_em DESC`,
    [idUsuario]
  );
  return res.rows;
}

async function atualizarPergunta(idPost, pergunta) {
  await db.query(`UPDATE posts SET enquete_pergunta = $2 WHERE id_post = $1`, [idPost, pergunta]);
}

// ---------- Enquetes ----------
async function criarOpcoes(idPost, textos) {
  for (let i = 0; i < textos.length; i++) {
    await db.query(`INSERT INTO enquete_opcoes (id_post, texto, ordem) VALUES ($1, $2, $3)`, [idPost, textos[i], i]);
  }
}

// Opções (com contagem, quem votou e se EU votei) de vários posts de uma vez.
async function listarEnquetesDeVarios(ids, idUsuarioAtual) {
  if (!ids || !ids.length) return [];
  const res = await db.query(
    `SELECT o.id_post, o.id_opcao, o.texto, o.ordem, p.enquete_multipla, p.enquete_pergunta, p.id_usuario AS id_autor,
            (SELECT COUNT(*)::int FROM enquete_votos v WHERE v.id_opcao = o.id_opcao) AS votos,
            EXISTS(SELECT 1 FROM enquete_votos v WHERE v.id_opcao = o.id_opcao AND v.id_usuario = $2) AS votei,
            COALESCE((SELECT json_agg(json_build_object('nome', u.nome, 'usuario', u.usuario, 'foto', u.foto_perfil) ORDER BY v.criado_em DESC)
                        FROM enquete_votos v JOIN usuarios u ON u.id_usuario = v.id_usuario
                       WHERE v.id_opcao = o.id_opcao), '[]'::json) AS votantes
       FROM enquete_opcoes o
       JOIN posts p ON p.id_post = o.id_post
      WHERE o.id_post = ANY($1)
      ORDER BY o.id_post, o.ordem, o.id_opcao`,
    [ids, idUsuarioAtual]
  );
  return res.rows;
}

async function buscarOpcao(idOpcao) {
  const res = await db.query(`SELECT id_opcao, id_post FROM enquete_opcoes WHERE id_opcao = $1`, [idOpcao]);
  return res.rows[0] || null;
}

// Vota/desvota (toggle). Na enquete de resposta única, trocar de opção substitui o voto anterior.
async function alternarVoto(idPost, idOpcao, idUsuario, multipla) {
  const ja = await db.query(`SELECT 1 FROM enquete_votos WHERE id_opcao = $1 AND id_usuario = $2`, [idOpcao, idUsuario]);
  if (ja.rowCount) {
    await db.query(`DELETE FROM enquete_votos WHERE id_opcao = $1 AND id_usuario = $2`, [idOpcao, idUsuario]);
    return false;
  }
  if (!multipla) await db.query(`DELETE FROM enquete_votos WHERE id_post = $1 AND id_usuario = $2`, [idPost, idUsuario]);
  await db.query(`INSERT INTO enquete_votos (id_opcao, id_post, id_usuario) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [idOpcao, idPost, idUsuario]);
  return true;
}

// "votou em X" de um usuário num post (texto das opções, na ordem).
async function votoDoUsuario(idPost, idUsuario) {
  const res = await db.query(
    `SELECT string_agg(o.texto, ', ' ORDER BY o.ordem) AS votou
       FROM enquete_votos v JOIN enquete_opcoes o ON o.id_opcao = v.id_opcao
      WHERE v.id_post = $1 AND v.id_usuario = $2`,
    [idPost, idUsuario]
  );
  return (res.rows[0] && res.rows[0].votou) || null;
}

// Feed paginado por cursor: "antesDe" = id do post mais antigo já na tela (rolagem infinita).
async function listarFeed(idUsuarioAtual, limite = 50, antesDe = null) {
  const res = await db.query(
    `${SELECT_POST} WHERE ($3::int IS NULL OR p.id_post < $3) ORDER BY p.id_post DESC LIMIT $2`,
    [idUsuarioAtual, limite, antesDe || null]
  );
  return res.rows;
}

// Posts publicados DEPOIS do id informado (feed ao vivo: entram no topo sem recarregar).
async function listarNovosDesde(idUsuarioAtual, depois, limite = 20) {
  const res = await db.query(
    `${SELECT_POST} WHERE p.id_post > $2 ORDER BY p.id_post DESC LIMIT $3`,
    [idUsuarioAtual, depois || 0, limite]
  );
  return res.rows;
}

async function listarPorUsuario(idAutor, idUsuarioAtual) {
  const res = await db.query(
    `${SELECT_POST} WHERE (p.id_usuario = $2 OR p.id_colaborador = $2
        OR EXISTS (SELECT 1 FROM post_colaboradores pc WHERE pc.id_post = p.id_post AND pc.id_usuario = $2))
      ORDER BY p.criado_em DESC`,
    [idUsuarioAtual, idAutor]
  );
  return res.rows;
}

// Posts que "idAutor" repostou (ordenados pela data do repost).
async function listarRepostadosPor(idAutor, idUsuarioAtual) {
  const res = await db.query(
    `${SELECT_POST}
       JOIN reposts rp ON rp.id_post = p.id_post AND rp.id_usuario = $2
      ORDER BY rp.criado_em DESC`,
    [idUsuarioAtual, idAutor]
  );
  return res.rows;
}

// Quantas publicações a pessoa repostou (número do perfil)
async function contarRepostadosPor(idUsuario) {
  const res = await db.query('SELECT count(*)::int AS n FROM reposts WHERE id_usuario = $1', [idUsuario]);
  return res.rows[0] ? res.rows[0].n : 0;
}

async function buscarPorId(idPost) {
  const res = await db.query(`SELECT id_post, id_usuario, texto, imagem, video, enquete_pergunta FROM posts WHERE id_post = $1`, [idPost]);
  return res.rows[0] || null;
}

// Dono editou o texto (legenda) da publicação: grava e marca editado_em.
async function atualizarTexto(idPost, texto) {
  const res = await db.query(
    `UPDATE posts SET texto = $2, editado_em = now() WHERE id_post = $1 RETURNING texto, editado_em`,
    [idPost, texto]
  );
  return res.rows[0] || null;
}

// Colaboradores do post (post em dupla/trio: "fulano e +N").
async function adicionarColaboradores(idPost, ids) {
  for (const id of ids) {
    await db.query(
      `INSERT INTO post_colaboradores (id_post, id_usuario) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [idPost, id]
    );
  }
}

// Quantos posts entraram depois do id X (polling leve do feed ao vivo).
async function contarNovosDesde(idPost) {
  const res = await db.query(`SELECT COUNT(*)::int AS n FROM posts WHERE id_post > $1`, [idPost]);
  return res.rows[0].n;
}

// Post completo (com autor + contagens + curtiu) para a página individual.
// Busca de publicações (texto, localização ou @autor), mais novas primeiro.
// Busca de publicações: por texto/lugar/autor (sem acento) OU de um lugar exato.
// antes = id da última já mostrada ("carregar mais").
async function buscarPosts(idUsuarioAtual, termo, limite = 12, opcoes = {}) {
  const t = String(termo || '').trim();
  const local = opcoes.local ? String(opcoes.local).trim() : '';
  const antes = parseInt(opcoes.antes, 10) || null;
  if (!t && !local) return [];
  const S = db.semAcentoSql;
  const filtro = local
    ? 'p.local = $3'
    : `(${S('p.texto')} LIKE $3 OR ${S('p.local')} LIKE $3 OR ${S('u.usuario')} LIKE $3 OR ${S('u.nome')} LIKE $3)`;
  const res = await db.query(
    `${SELECT_POST} WHERE ${filtro} AND ($4::int IS NULL OR p.id_post < $4)
     ORDER BY p.id_post DESC LIMIT $2`,
    [idUsuarioAtual, limite, local || `%${db.semAcentoJs(t)}%`, antes]
  );
  return res.rows;
}

// Lugares marcados nas publicações que batem com o termo (com quantas publicações cada um)
async function buscarLugares(termo, limite = 8) {
  const t = String(termo || '').trim();
  if (!t) return [];
  const res = await db.query(
    `SELECT p.local, count(*)::int AS total FROM posts p
      WHERE p.local IS NOT NULL AND p.local <> '' AND ${db.semAcentoSql('p.local')} LIKE $1
      GROUP BY p.local ORDER BY total DESC, max(p.id_post) DESC LIMIT $2`,
    [`%${db.semAcentoJs(t)}%`, limite]
  );
  return res.rows;
}

async function buscarFeedUm(idPost, idUsuarioAtual) {
  const res = await db.query(`${SELECT_POST} WHERE p.id_post = $2`, [idUsuarioAtual, idPost]);
  return res.rows[0] || null;
}

async function remover(idPost) {
  await db.query(`DELETE FROM posts WHERE id_post = $1`, [idPost]);
}

// ---------- Curtidas ----------
// Curtir com reação (❤️ por padrão). Reagir de novo com outro emoji troca a reação.
async function curtir(idPost, idUsuario, reacao = '❤️') {
  await db.query(
    `INSERT INTO post_curtidas (id_post, id_usuario, reacao) VALUES ($1, $2, $3)
     ON CONFLICT (id_post, id_usuario) DO UPDATE SET reacao = EXCLUDED.reacao, criado_em = now()`,
    [idPost, idUsuario, reacao]
  );
}
async function reacaoDe(idPost, idUsuario) {
  const res = await db.query(`SELECT reacao FROM post_curtidas WHERE id_post = $1 AND id_usuario = $2`, [idPost, idUsuario]);
  return res.rows[0] ? res.rows[0].reacao : null;
}
async function reacoesTop(idPost) {
  const res = await db.query(
    `SELECT reacao FROM post_curtidas WHERE id_post = $1 GROUP BY reacao ORDER BY COUNT(*) DESC, reacao LIMIT 3`,
    [idPost]
  );
  return res.rows.map((r) => r.reacao);
}
async function descurtir(idPost, idUsuario) {
  await db.query(`DELETE FROM post_curtidas WHERE id_post = $1 AND id_usuario = $2`, [idPost, idUsuario]);
}
async function jaCurtiu(idPost, idUsuario) {
  const res = await db.query(`SELECT 1 FROM post_curtidas WHERE id_post = $1 AND id_usuario = $2`, [idPost, idUsuario]);
  return res.rowCount > 0;
}
async function contarCurtidas(idPost) {
  const res = await db.query(`SELECT COUNT(*)::int AS n FROM post_curtidas WHERE id_post = $1`, [idPost]);
  return res.rows[0].n;
}
// Quem curtiu (mais recentes primeiro) — para a folha "Curtidas" do post.
// eu (opcional): quem está vendo vai para o fim da lista (como no "Curtido por" do Instagram)
async function listarCurtidores(idPost, limite = 200, eu = null) {
  const res = await db.query(
    `SELECT u.nome, u.usuario, u.foto_perfil, c.reacao
       FROM post_curtidas c
       JOIN usuarios u ON u.id_usuario = c.id_usuario
      WHERE c.id_post = $1
      ORDER BY (c.id_usuario = $3) ASC, c.criado_em DESC
      LIMIT $2`,
    [idPost, limite, eu]
  );
  return res.rows;
}

// ---------- Reposts ----------
async function repostar(idPost, idUsuario) {
  await db.query(`INSERT INTO reposts (id_post, id_usuario) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [idPost, idUsuario]);
}
async function desfazerRepost(idPost, idUsuario) {
  await db.query(`DELETE FROM reposts WHERE id_post = $1 AND id_usuario = $2`, [idPost, idUsuario]);
}
async function jaRepostou(idPost, idUsuario) {
  const res = await db.query(`SELECT 1 FROM reposts WHERE id_post = $1 AND id_usuario = $2`, [idPost, idUsuario]);
  return res.rowCount > 0;
}
async function contarReposts(idPost) {
  const res = await db.query(`SELECT COUNT(*)::int AS n FROM reposts WHERE id_post = $1`, [idPost]);
  return res.rows[0].n;
}

// ---------- Comentários ----------
async function adicionarComentario(idPost, idUsuario, texto, imagem = null, respondeA = null) {
  const res = await db.query(
    `INSERT INTO post_comentarios (id_post, id_usuario, texto, imagem, responde_a) VALUES ($1, $2, $3, $4, $5) RETURNING id_comentario`,
    [idPost, idUsuario, texto || null, imagem || null, respondeA || null]
  );
  return res.rows[0];
}
// "votou": em post com enquete, a(s) opção(ões) que o autor do comentário escolheu (tag no comentário)
const VOTOU = `(SELECT string_agg(o.texto, ', ' ORDER BY o.ordem)
                  FROM enquete_votos v JOIN enquete_opcoes o ON o.id_opcao = v.id_opcao
                 WHERE v.id_post = m.id_post AND v.id_usuario = m.id_usuario) AS votou`;
// eu = quem está vendo (para o coração do comentário vir marcado)
async function listarComentarios(idPost, eu = null) {
  const res = await db.query(
    `SELECT m.id_comentario, m.texto, m.imagem, m.criado_em, m.id_usuario, m.responde_a, u.nome, u.usuario, u.foto_perfil, ${VOTOU},
            (SELECT COUNT(*) FROM comentario_curtidas cc WHERE cc.id_comentario = m.id_comentario)::int AS curtidas,
            EXISTS(SELECT 1 FROM comentario_curtidas cc2 WHERE cc2.id_comentario = m.id_comentario AND cc2.id_usuario = $2) AS curti
       FROM post_comentarios m JOIN usuarios u ON u.id_usuario = m.id_usuario
      WHERE m.id_post = $1 ORDER BY m.criado_em ASC`,
    [idPost, eu]
  );
  return res.rows;
}
async function listarComentariosDeVarios(ids, eu = null) {
  if (!ids || !ids.length) return [];
  const res = await db.query(
    `SELECT m.id_comentario, m.id_post, m.texto, m.imagem, m.criado_em, m.id_usuario, m.responde_a, u.nome, u.usuario, u.foto_perfil, ${VOTOU},
            (SELECT COUNT(*) FROM comentario_curtidas cc WHERE cc.id_comentario = m.id_comentario)::int AS curtidas,
            EXISTS(SELECT 1 FROM comentario_curtidas cc2 WHERE cc2.id_comentario = m.id_comentario AND cc2.id_usuario = $2) AS curti
       FROM post_comentarios m JOIN usuarios u ON u.id_usuario = m.id_usuario
      WHERE m.id_post = ANY($1) ORDER BY m.criado_em ASC`,
    [ids, eu]
  );
  return res.rows;
}

async function buscarComentario(idComentario) {
  const res = await db.query(`SELECT id_comentario, id_usuario, id_post, imagem, responde_a FROM post_comentarios WHERE id_comentario = $1`, [idComentario]);
  return res.rows[0] || null;
}
// ---------- Curtidas em comentários ----------
async function curtirComentario(idComentario, idUsuario) {
  await db.query(
    `INSERT INTO comentario_curtidas (id_comentario, id_usuario) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [idComentario, idUsuario]
  );
}
async function descurtirComentario(idComentario, idUsuario) {
  await db.query(`DELETE FROM comentario_curtidas WHERE id_comentario = $1 AND id_usuario = $2`, [idComentario, idUsuario]);
}
async function jaCurtiuComentario(idComentario, idUsuario) {
  const res = await db.query(`SELECT 1 FROM comentario_curtidas WHERE id_comentario = $1 AND id_usuario = $2`, [idComentario, idUsuario]);
  return res.rowCount > 0;
}
async function contarCurtidasComentario(idComentario) {
  const res = await db.query(`SELECT count(*)::int AS n FROM comentario_curtidas WHERE id_comentario = $1`, [idComentario]);
  return res.rows[0] ? res.rows[0].n : 0;
}

// Fotos dos comentários de um post (para apagar do disco junto com o post).
async function listarImagensComentarios(idPost) {
  const res = await db.query(`SELECT imagem FROM post_comentarios WHERE id_post = $1 AND imagem IS NOT NULL`, [idPost]);
  return res.rows.map((r) => r.imagem);
}
async function removerComentario(idComentario) {
  await db.query(`DELETE FROM post_comentarios WHERE id_comentario = $1`, [idComentario]);
}

module.exports = {
  atualizarVideo,
  buscarPosts, buscarLugares,
  curtirComentario, descurtirComentario, jaCurtiuComentario, contarCurtidasComentario,
  criar, listarFeed, listarNovosDesde, listarPorUsuario, listarRepostadosPor, contarRepostadosPor, buscarPorId, buscarFeedUm, remover, contarNovosDesde, adicionarColaboradores, atualizarTexto,
  curtir, descurtir, jaCurtiu, contarCurtidas, listarCurtidores, reacaoDe, reacoesTop,
  adicionarMidias, listarMidias, locaisSugeridos, salvar, dessalvar, jaSalvou, listarSalvosPor,
  repostar, desfazerRepost, jaRepostou, contarReposts,
  adicionarComentario, listarComentarios, listarComentariosDeVarios, buscarComentario, removerComentario, listarImagensComentarios,
  criarOpcoes, listarEnquetesDeVarios, buscarOpcao, alternarVoto, votoDoUsuario, atualizarPergunta,
};
