# Anjo Secreto 😇

Sistema web interno para organizar a brincadeira corporativa do **Anjo Secreto** — uma rodada
por mês: cada participante é sorteado como **anjo** de outra pessoa (seu **protegido**),
presenteia em segredo durante o mês e conversa por um **chat anônimo**. O anjo sabe quem tirou;
o protegido **nunca** descobre quem é o anjo.

## Como funciona

1. O administrador cadastra/aprova os usuários e cria a **campanha do mês**.
2. Adiciona os participantes e clica em **Iniciar sorteio** (mínimo de 3).
3. O sistema sorteia em **ciclo completo** — ninguém tira a si mesmo; cada um é anjo de uma
   pessoa e tem um anjo.
4. Cada participante vê **quem tirou (protegido)** e o que ele gosta, e troca **mensagens
   anônimas** com o protegido e com o próprio anjo durante o mês.
5. No fim, o administrador **encerra** a campanha (vira somente leitura).

---

## Tecnologias

- **Node.js** + **Express** (estrutura MVC)
- **PostgreSQL 12+** (`pg` com pool de conexões)
- **Handlebars** (`express-handlebars`) para as views
- **Design system próprio** (mobile-first, tema claro/escuro) — sem framework de front-end
- Segurança: **Helmet/CSP (nonce)**, **CSRF** (synchronizer token), **rate limit**,
  sessão no banco (`connect-pg-simple`), senhas com **bcryptjs**

> A estrutura de banco e as convenções seguem o padrão do projeto interno `sistema-sugestoes`.

---

## Pré-requisitos

- Node.js 18+ (testado no Node 24)
- PostgreSQL 12+ rodando e acessível

## Instalação (do zero)

```bash
# 1. Instalar dependências
npm install

# 2. Configurar ambiente
#    Copie o exemplo e ajuste as credenciais do banco
cp .env.example .env        # no Windows: copy .env.example .env

# 3. Criar o banco + aplicar o schema + migrations
npm run db:setup

# 4. Criar o administrador inicial
npm run db:seed

# 5. Subir o servidor (modo desenvolvimento, com auto-reload)
npm run dev
```

Acesse **http://localhost:3000** (a porta vem de `PORT`).

### Administrador inicial

O `npm run db:seed` cria o admin a partir do `.env`:

| Variável                | Padrão (no `.env` de exemplo) |
|-------------------------|-------------------------------|
| `ADMIN_INICIAL_USUARIO` | `admin`                       |
| `ADMIN_INICIAL_SENHA`   | `troque@123`                  |

> **Login é por usuário** (nome/apelido), **não por e-mail**.

---

## Scripts

| Comando              | O que faz                                                        |
|----------------------|------------------------------------------------------------------|
| `npm start`          | Sobe o servidor                                                  |
| `npm run dev`        | Sobe com auto-reload (`node --watch`)                            |
| `npm run db:setup`   | Cria o banco (se não existir), aplica `schema.sql` e migrations  |
| `npm run db:seed`    | Cria o administrador inicial (idempotente)                       |
| `npm run migrate`    | Aplica migrations pendentes (`/migrations`)                      |
| `npm run migrate:down` | Desfaz a última migration                                      |
| `npm test`           | Roda os testes automatizados (`node --test`)                     |

---

## Estrutura

```txt
src/
  config/      env, db (pool), session, security (helmet/CSP/rate-limit), handlebars
  controllers/ auth, usuario, campanha, participanteAdmin, sorteio, admin, participante
  services/    auth, usuario, campanha, participante, sorteio, preferencia, mensagem, log
  models/      usuario, campanha, participante, sorteio, preferencia, mensagem
  routes/      auth, admin, participante
  middlewares/ auth (sessão/perfil), csrf, errorHandler
  validators/  auth (express-validator)
  views/       layouts (main, auth) + admin/ + participante/ + auth/ + partials/ + erros/
  public/      css/estilo.css, js/ui.js, favicon.svg
  db/          schema.sql, setup.js, seed.js
migrations/    migrations versionadas (node-pg-migrate)
scripts/       migrate.js
tests/         sorteio, mensagem, auth
```

---

## Perfis e funcionalidades

**Administrador**
- Aprovar/recusar auto-cadastros; criar, editar, ativar/inativar e resetar senha de usuários
- Criar/editar/encerrar campanhas; gerenciar participantes; iniciar/refazer o sorteio
- Ver **logs** de auditoria e a **tela emergencial** de revelação dos pares (com log obrigatório)

**Participante**
- Login por usuário; troca obrigatória de senha provisória no primeiro acesso
- Ver o **protegido** e as preferências dele; cadastrar as próprias preferências
- **Chat anônimo** com o protegido e com o anjo; contador de não lidas

---

## Segurança (checklist)

- [x] Senhas com hash **bcryptjs**
- [x] Todas as rotas privadas exigem autenticação; rotas `/admin` exigem perfil ADMINISTRADOR
- [x] **Sessão** no PostgreSQL, cookie `httpOnly` + `sameSite=lax` (+ `secure` em produção)
- [x] **CSRF** em todos os formulários (synchronizer token, comparação em tempo constante)
- [x] **Helmet** + **CSP com nonce** (sem `unsafe-inline` para scripts) + Permissions-Policy
- [x] **Rate limit**: login (anti força-bruta), auto-cadastro e geral
- [x] Validação/sanitização de entrada (express-validator) + queries parametrizadas
- [x] **Anti-lockout**: não dá para inativar/rebaixar a si mesmo nem o último admin ativo
- [x] Sorteio em **transação com trava** (`SELECT … FOR UPDATE`)
- [x] **Toda ação sensível gera log** (login, cadastro, sorteio, revelação, etc.)
- [x] `npm audit` sem vulnerabilidades

### Anonimato

É **lógico (de interface)**: nenhuma tela revela o anjo ao protegido e não existe rota que
devolva o anjo. Os vínculos do sorteio e a autoria das mensagens ficam no banco em claro — quem
tem acesso direto ao banco consegue descobrir os pares. O acesso administrativo a essa informação
é restrito à **tela emergencial**, que sempre registra log. (Anonimato criptográfico forte é uma
melhoria futura.)

---

## Testes

```bash
npm test
```

Cobrem o algoritmo do **sorteio** (ciclo completo, sem auto-anjo, par/ímpar, mínimo de 3,
200 execuções aleatórias), a **classificação do chat** (threads anjo/protegido) e
**auth/autorização/segurança** (redirecionamentos, bloqueio de CSRF, cabeçalhos).

---

## Melhorias futuras

- Notificações por e-mail / WhatsApp
- Consulta (somente leitura) das mensagens de campanhas já encerradas
- Restrições de pareamento no sorteio (não sortear A↔B)
- Anonimato criptográfico (cifrar vínculos/autoria)
- Revelação automática ao encerrar a campanha

---

_Desenvolvido por Ihago Martins._
