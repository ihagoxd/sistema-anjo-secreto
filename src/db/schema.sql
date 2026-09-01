-- ============================================================
--  SCHEMA DO SISTEMA ANJO SECRETO
--  Roda de forma idempotente: pode rodar várias vezes sem erro.
--  Tabelas/colunas em português (conforme requisito).
-- ============================================================

-- Atualiza automaticamente a coluna atualizado_em em cada UPDATE.
CREATE OR REPLACE FUNCTION fn_atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------- USUÁRIOS ----------
-- usuario: login (nome ou apelido) — é por ele que a pessoa entra.
-- email: OPCIONAL (não é usado para login).
-- tipo_usuario: 'ADMINISTRADOR' (gerencia tudo) | 'PARTICIPANTE' (joga)
-- status: 'PENDENTE' (auto-cadastro aguardando aprovação) | 'APROVADO' | 'RECUSADO'
-- senha_provisoria: TRUE força troca de senha no primeiro acesso
CREATE TABLE IF NOT EXISTS usuarios (
  id_usuario        SERIAL PRIMARY KEY,
  nome              VARCHAR(150) NOT NULL,
  usuario           VARCHAR(80),
  email             VARCHAR(180) UNIQUE,
  senha_hash        TEXT NOT NULL,
  tipo_usuario      VARCHAR(30) NOT NULL DEFAULT 'PARTICIPANTE'
                    CHECK (tipo_usuario IN ('ADMINISTRADOR', 'PARTICIPANTE')),
  status            VARCHAR(20) NOT NULL DEFAULT 'APROVADO'
                    CHECK (status IN ('PENDENTE', 'APROVADO', 'RECUSADO')),
  ativo             BOOLEAN NOT NULL DEFAULT TRUE,
  senha_provisoria  BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migração idempotente para bancos já existentes
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS usuario VARCHAR(80);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'APROVADO';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_perfil TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perfil_completo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bio VARCHAR(200);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS humor VARCHAR(20);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS humor_data DATE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS data_nascimento DATE;
ALTER TABLE usuarios ALTER COLUMN email DROP NOT NULL;
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_status_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_status_check
  CHECK (status IN ('PENDENTE', 'APROVADO', 'RECUSADO'));

-- Login por "usuario" é único e sem diferenciar maiúsc./minúsc.
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_usuario
  ON usuarios (lower(usuario)) WHERE usuario IS NOT NULL;

DROP TRIGGER IF EXISTS trg_usuarios_atualizado_em ON usuarios;
CREATE TRIGGER trg_usuarios_atualizado_em
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION fn_atualizar_timestamp();

-- ---------- CAMPANHAS ----------
-- status: RASCUNHO -> EM_ANDAMENTO (após sorteio) -> ENCERRADA
CREATE TABLE IF NOT EXISTS campanhas (
  id_campanha    SERIAL PRIMARY KEY,
  nome           VARCHAR(150) NOT NULL CHECK (length(trim(nome)) > 0),
  descricao      TEXT,
  status         VARCHAR(30) NOT NULL DEFAULT 'RASCUNHO'
                 CHECK (status IN ('RASCUNHO', 'EM_ANDAMENTO', 'ENCERRADA')),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  encerrado_em   TIMESTAMPTZ
);

DROP TRIGGER IF EXISTS trg_campanhas_atualizado_em ON campanhas;
CREATE TRIGGER trg_campanhas_atualizado_em
  BEFORE UPDATE ON campanhas
  FOR EACH ROW EXECUTE FUNCTION fn_atualizar_timestamp();

-- No máximo UMA campanha EM_ANDAMENTO por vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unica_campanha_ativa
  ON campanhas ((status)) WHERE status = 'EM_ANDAMENTO';

-- ---------- PARTICIPANTES DA CAMPANHA ----------
CREATE TABLE IF NOT EXISTS participantes (
  id_participante  SERIAL PRIMARY KEY,
  id_campanha      INTEGER NOT NULL REFERENCES campanhas(id_campanha) ON DELETE CASCADE,
  id_usuario       INTEGER NOT NULL REFERENCES usuarios(id_usuario),
  ativo            BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id_campanha, id_usuario)
);

-- ---------- SORTEIOS (pares anjo -> protegido) ----------
-- id_anjo e id_protegido referenciam PARTICIPANTES (garante no banco que
-- pertencem àquela campanha). Restrições: anjo único, protegido único,
-- e ninguém é anjo de si mesmo.
CREATE TABLE IF NOT EXISTS sorteios (
  id_sorteio     SERIAL PRIMARY KEY,
  id_campanha    INTEGER NOT NULL REFERENCES campanhas(id_campanha) ON DELETE CASCADE,
  id_anjo        INTEGER NOT NULL REFERENCES participantes(id_participante) ON DELETE CASCADE,
  id_protegido   INTEGER NOT NULL REFERENCES participantes(id_participante) ON DELETE CASCADE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id_campanha, id_anjo),
  UNIQUE (id_campanha, id_protegido),
  CHECK (id_anjo <> id_protegido)
);

-- ---------- PREFERÊNCIAS DO USUÁRIO ----------
-- Uma linha por usuário (preferências globais, não por campanha).
CREATE TABLE IF NOT EXISTS preferencias_usuario (
  id_preferencia          SERIAL PRIMARY KEY,
  id_usuario              INTEGER NOT NULL UNIQUE REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  lanche_favorito         VARCHAR(150),
  bebida_favorita         VARCHAR(150),
  chocolate_favorito      VARCHAR(150),
  hobbies                 TEXT,
  restricoes_alimentares  TEXT,
  coisas_que_gosta        TEXT,
  coisas_que_nao_gosta    TEXT,
  observacoes             TEXT,
  criado_em               TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_preferencias_atualizado_em ON preferencias_usuario;
CREATE TRIGGER trg_preferencias_atualizado_em
  BEFORE UPDATE ON preferencias_usuario
  FOR EACH ROW EXECUTE FUNCTION fn_atualizar_timestamp();

-- ---------- FOTOS DAS PREFERÊNCIAS (galeria que o anjo vê) ----------
CREATE TABLE IF NOT EXISTS preferencias_fotos (
  id_foto     SERIAL PRIMARY KEY,
  id_usuario  INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  caminho     TEXT NOT NULL,
  legenda     VARCHAR(120),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pref_fotos_usuario ON preferencias_fotos(id_usuario);

-- ---------- MENSAGENS ANÔNIMAS ----------
-- tipo_mensagem: ANJO_PARA_PROTEGIDO | PROTEGIDO_PARA_ANJO
-- arquivada: TRUE quando o sorteio é refeito (deixam de ser exibidas)
CREATE TABLE IF NOT EXISTS mensagens_anonimas (
  id_mensagem        SERIAL PRIMARY KEY,
  id_campanha        INTEGER NOT NULL REFERENCES campanhas(id_campanha) ON DELETE CASCADE,
  id_usuario_origem  INTEGER NOT NULL REFERENCES usuarios(id_usuario),
  id_usuario_destino INTEGER NOT NULL REFERENCES usuarios(id_usuario),
  tipo_mensagem      VARCHAR(40) NOT NULL
                     CHECK (tipo_mensagem IN ('ANJO_PARA_PROTEGIDO', 'PROTEGIDO_PARA_ANJO')),
  mensagem           TEXT NOT NULL CHECK (length(trim(mensagem)) > 0),
  lida               BOOLEAN NOT NULL DEFAULT FALSE,
  arquivada          BOOLEAN NOT NULL DEFAULT FALSE,
  editado_em         TIMESTAMPTZ,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE mensagens_anonimas ADD COLUMN IF NOT EXISTS editado_em TIMESTAMPTZ;
ALTER TABLE mensagens_anonimas ADD COLUMN IF NOT EXISTS imagem TEXT;
ALTER TABLE mensagens_anonimas ADD COLUMN IF NOT EXISTS audio TEXT;
ALTER TABLE mensagens_anonimas ADD COLUMN IF NOT EXISTS video TEXT;
ALTER TABLE mensagens_anonimas ADD COLUMN IF NOT EXISTS apagada_em TIMESTAMPTZ;
ALTER TABLE mensagens_anonimas ALTER COLUMN mensagem DROP NOT NULL;
ALTER TABLE mensagens_anonimas DROP CONSTRAINT IF EXISTS mensagens_anonimas_mensagem_check;
ALTER TABLE mensagens_anonimas DROP CONSTRAINT IF EXISTS ma_conteudo;
ALTER TABLE mensagens_anonimas ADD CONSTRAINT ma_conteudo CHECK (apagada_em IS NOT NULL OR mensagem IS NOT NULL OR imagem IS NOT NULL OR audio IS NOT NULL OR video IS NOT NULL);

-- ---------- MENSAGENS DIRETAS (Direct do escritório — chat normal, com nome) ----------
-- Conversa 1:1 entre quaisquer usuários aprovados (fora do canal anônimo anjo/protegido).
CREATE TABLE IF NOT EXISTS mensagens_diretas (
  id_mensagem      SERIAL PRIMARY KEY,
  id_remetente     INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  id_destinatario  INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  texto            TEXT NOT NULL CHECK (length(trim(texto)) > 0),
  lida             BOOLEAN NOT NULL DEFAULT FALSE,
  editado_em       TIMESTAMPTZ,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (id_remetente <> id_destinatario)
);
CREATE INDEX IF NOT EXISTS idx_dm_par
  ON mensagens_diretas (LEAST(id_remetente, id_destinatario), GREATEST(id_remetente, id_destinatario), criado_em);
CREATE INDEX IF NOT EXISTS idx_dm_nao_lidas
  ON mensagens_diretas (id_destinatario) WHERE lida = FALSE;
ALTER TABLE mensagens_diretas ADD COLUMN IF NOT EXISTS imagem TEXT;
ALTER TABLE mensagens_diretas ADD COLUMN IF NOT EXISTS audio TEXT;
ALTER TABLE mensagens_diretas ADD COLUMN IF NOT EXISTS video TEXT;
ALTER TABLE mensagens_diretas ADD COLUMN IF NOT EXISTS apagada_em TIMESTAMPTZ;
ALTER TABLE mensagens_diretas ALTER COLUMN texto DROP NOT NULL;
ALTER TABLE mensagens_diretas DROP CONSTRAINT IF EXISTS mensagens_diretas_texto_check;
ALTER TABLE mensagens_diretas DROP CONSTRAINT IF EXISTS md_conteudo;
ALTER TABLE mensagens_diretas ADD CONSTRAINT md_conteudo CHECK (apagada_em IS NOT NULL OR texto IS NOT NULL OR imagem IS NOT NULL OR audio IS NOT NULL OR video IS NOT NULL);
-- Cartão de story na DM (responder/encaminhar story, estilo Instagram): guarda a
-- referência para abrir o story enquanto estiver no ar (a mídia copiada fica na msg)
ALTER TABLE mensagens_diretas ADD COLUMN IF NOT EXISTS story_ref INTEGER;
ALTER TABLE mensagens_diretas ADD COLUMN IF NOT EXISTS story_autor INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL;
ALTER TABLE mensagens_diretas ADD COLUMN IF NOT EXISTS story_tipo VARCHAR(12);

-- ---------- NOTIFICAÇÕES ----------
-- tipo: MENSAGEM | MENSAGEM_ANJO | MENSAGEM_PROTEGIDO | CURTIDA | COMENTARIO | ANIVERSARIO
-- id_ator: quem gerou (NULL quando anônimo, ex.: mensagem do anjo).
CREATE TABLE IF NOT EXISTS notificacoes (
  id_notificacao SERIAL PRIMARY KEY,
  id_usuario     INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  tipo           VARCHAR(30) NOT NULL,
  id_ator        INTEGER REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  link           VARCHAR(200),
  ref            INTEGER,
  lida           BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_usuario ON notificacoes(id_usuario, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_notif_nao_lidas ON notificacoes(id_usuario) WHERE lida = FALSE;

-- ---------- LOGS DO SISTEMA (auditoria) ----------
-- acao: catálogo padronizado (LOGIN_SUCESSO, SORTEIO_INICIADO, ...)
CREATE TABLE IF NOT EXISTS logs_sistema (
  id_log         SERIAL PRIMARY KEY,
  id_usuario     INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
  acao           VARCHAR(80) NOT NULL,
  descricao      TEXT,
  entidade       VARCHAR(60),
  id_referencia  INTEGER,
  ip             VARCHAR(45),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- MURAL (rede social interna) ----------
CREATE TABLE IF NOT EXISTS posts (
  id_post     SERIAL PRIMARY KEY,
  id_usuario  INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  texto       TEXT,
  imagem      TEXT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (texto IS NOT NULL OR imagem IS NOT NULL)
);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS video TEXT;
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_texto_check;
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_check;
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_conteudo;
ALTER TABLE posts ADD CONSTRAINT posts_conteudo CHECK (texto IS NOT NULL OR imagem IS NOT NULL OR video IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_posts_criado ON posts(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_posts_usuario ON posts(id_usuario);

CREATE TABLE IF NOT EXISTS post_curtidas (
  id_post     INTEGER NOT NULL REFERENCES posts(id_post) ON DELETE CASCADE,
  id_usuario  INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id_post, id_usuario)
);

CREATE TABLE IF NOT EXISTS post_comentarios (
  id_comentario SERIAL PRIMARY KEY,
  id_post       INTEGER NOT NULL REFERENCES posts(id_post) ON DELETE CASCADE,
  id_usuario    INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  texto         TEXT NOT NULL,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coment_post ON post_comentarios(id_post);

-- Reposts (repostar publicação de alguém)
CREATE TABLE IF NOT EXISTS reposts (
  id_repost   SERIAL PRIMARY KEY,
  id_usuario  INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  id_post     INTEGER NOT NULL REFERENCES posts(id_post) ON DELETE CASCADE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id_usuario, id_post)
);
CREATE INDEX IF NOT EXISTS idx_reposts_usuario ON reposts(id_usuario, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_reposts_post ON reposts(id_post);

-- ---------- STORIES (estilo Instagram: foto/vídeo que expira em 24 h) ----------
CREATE TABLE IF NOT EXISTS stories (
  id_story    SERIAL PRIMARY KEY,
  id_usuario  INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  imagem      VARCHAR(300),
  video       VARCHAR(300),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stories_usuario ON stories(id_usuario, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_stories_criado ON stories(criado_em);

-- Curtidas de story (o coração do visualizador, como no Instagram)
CREATE TABLE IF NOT EXISTS story_curtidas (
  id_story    INTEGER NOT NULL REFERENCES stories(id_story) ON DELETE CASCADE,
  id_usuario  INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id_story, id_usuario)
);

-- Quem já viu cada story (anel dourado vira cinza depois de visto, como no Instagram)
CREATE TABLE IF NOT EXISTS story_vistos (
  id_story    INTEGER NOT NULL REFERENCES stories(id_story) ON DELETE CASCADE,
  id_usuario  INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  visto_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id_story, id_usuario)
);

-- ---------- ÍNDICES ----------
CREATE INDEX IF NOT EXISTS idx_usuarios_email        ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_participantes_campanha ON participantes(id_campanha);
CREATE INDEX IF NOT EXISTS idx_sorteios_campanha      ON sorteios(id_campanha);
CREATE INDEX IF NOT EXISTS idx_sorteios_anjo          ON sorteios(id_anjo);
CREATE INDEX IF NOT EXISTS idx_sorteios_protegido     ON sorteios(id_protegido);
CREATE INDEX IF NOT EXISTS idx_mensagens_destino      ON mensagens_anonimas(id_usuario_destino);
CREATE INDEX IF NOT EXISTS idx_mensagens_campanha     ON mensagens_anonimas(id_campanha);
CREATE INDEX IF NOT EXISTS idx_logs_usuario           ON logs_sistema(id_usuario);
CREATE INDEX IF NOT EXISTS idx_logs_acao              ON logs_sistema(acao);
