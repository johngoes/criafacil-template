@AGENTS.md

# CriaFácil — Guia do Projeto

Este projeto foi criado a partir do template **CriaFácil**. A pessoa usuária
normalmente **não tem conhecimento técnico**: explique as coisas em português
simples, evite jargão, e tome as decisões técnicas por ela.

## Arquitetura

- **Frontend:** Next.js (App Router, pasta `app/`), React, Tailwind CSS v4. Hospedado na Vercel.
- **Backend (BaaS):** API Laravel central em `https://api-criafacil.goes.dev.br/api/v1`.
  Não existe banco de dados local, nem backend próprio neste repositório. **Não instale**
  Prisma, Supabase, Firebase ou similares.
- **Arquivos:** Cloudflare R2, via endpoint `POST /storage/upload`.
- **Variáveis de ambiente** (`.env.local`):
  - `NEXT_PUBLIC_API_URL` — URL base da API.
  - `NEXT_PUBLIC_PROJECT_KEY` — chave do projeto (identifica este app na API).

Esta versão do Next.js pode ter mudanças em relação ao que você conhece. Consulte
`node_modules/next/dist/docs/` antes de usar APIs do Next que não estejam neste guia.

## Como persistir dados

Use **sempre** as funções de `lib/api.ts`:

```ts
import {
  getRecords, createRecord, updateRecord, updateItem, deleteRecord, uploadFile, toItems,
} from "@/lib/api";

const response = await getRecords("tarefas", { page: "1" });          // GET  /tarefas
const itens = response.data.map(item => ({ id: item.id, ...item.data })); // ou toItems(response.data)

await createRecord("tarefas", { titulo: "Comprar pão", concluida: false }); // POST /tarefas
await updateItem("tarefas", itens[0], { concluida: true });           // PUT  /tarefas/{id} (payload completo)
await deleteRecord("tarefas", itens[0].id);                           // DELETE /tarefas/{id}
const { url } = await uploadFile(file);                               // POST /storage/upload
```

- Nomes de coleções (ex.: `tarefas`, `clientes`, `produtos`): use minúsculas, no
  plural, sem acentos e sem espaços.
- `getRecords` retorna a paginação do Laravel: `{ data: [...], meta: {...} }`. A lista
  está em `.data`.

## ⚠️ Regras Críticas de Consumo da API (OBRIGATÓRIAS)

### 1. Formato do GET

Cada registro retornado pela API vem neste formato — os campos do usuário ficam
**dentro** de `data`:

```json
{ "id": 1, "collection": "tarefas", "data": { "titulo": "Comprar pão", "concluida": false }, "created_at": "2026-11-04T12:00:00Z" }
```

**Sempre** mapeie os dados no React assim (ou use o helper `toItems`, que faz o mesmo):

```ts
const itens = response.data.map(item => ({ id: item.id, ...item.data }));
```

Nunca leia `item.titulo` direto do registro bruto — seria `undefined`.

### 2. Atualização Completa no PUT

O endpoint `PUT /api/v1/{collection}/{id}` **substitui todo o conteúdo** da coluna
`data`. Campos que não forem enviados são **apagados**.

- **NUNCA** envie apenas campos parciais, como `{ concluida: true }` — isso apaga o
  título e todos os outros campos do registro.
- **Sempre** envie o payload completo, preservando todos os campos existentes do registro.
- Forma recomendada: `updateItem(collection, itemCompleto, alteracoes)`, que mescla o
  item atual com as alterações e envia tudo.
- Se usar `updateRecord` diretamente: `updateRecord("tarefas", t.id, { ...dadosAtuais, concluida: true })`
  (sem o `id` dentro do payload).

```ts
// ❌ ERRADO — apaga todos os outros campos
await updateRecord("tarefas", tarefa.id, { concluida: true });

// ✅ CERTO
await updateItem("tarefas", tarefa, { concluida: true });
```
- Se precisar usar `fetch` diretamente, **sempre** envie o header:
  `x-project-key: process.env.NEXT_PUBLIC_PROJECT_KEY`.
- Erros da API lançam `ApiError` (com `status` e `body`). Sempre trate erros e mostre
  uma mensagem amigável na tela.

### Regra crítica do payload

Todo **POST** e **PUT** de dados **DEVE** ser envelopado em `{ "data": { ... } }`.
As funções `createRecord`/`updateRecord` já fazem isso — passe só o objeto puro.
Se usar `fetch` manualmente, envelope você mesmo.

### Regra de arquivos

**NUNCA** salve arquivos (imagens, PDFs, etc.) em Base64 dentro do JSON.
Sempre use `uploadFile(file)` (ou `POST /storage/upload` com o campo `file` em
multipart/form-data) e salve **apenas a URL retornada** no registro:

```ts
const { url } = await uploadFile(file);
await createRecord("produtos", { nome: "Bolo", foto_url: url });
```

## Autenticação de Usuários (Login/Cadastro Opcional)

Só implemente login quando a pessoa usuária pedir proteção por senha, contas de
usuário, "área restrita", "cada um vê só os seus dados" ou algo parecido. Nesses casos,
use **os endpoints de auth do BaaS** — nunca crie um sistema de login próprio, nem
instale bibliotecas de autenticação (NextAuth, Clerk, etc.).

Todas as chamadas abaixo também enviam o header `x-project-key`, como qualquer outra.

| Ação | Rota | Body | Resposta |
|---|---|---|---|
| Cadastro | `POST /auth/register` | `{ "name": "...", "email": "...", "password": "..." }` | — |
| Login | `POST /auth/login` | `{ "email": "...", "password": "..." }` | `{ "token": "...", "user": { ... } }` |
| Usuário logado | `GET /auth/me` | — (header `Authorization: Bearer <token>`) | dados do usuário |

> Atenção: as rotas de auth **não** usam o envelope `{ "data": ... }` — o body é enviado
> exatamente como na tabela acima. O envelope `data` vale para os registros das coleções.

Use **sempre** os helpers de `lib/api.ts` — não chame as rotas de auth com `fetch` manual:

```ts
import { register, login, getMe, logout, isLoggedIn } from "@/lib/api";

// Cadastro (se a API devolver token, o usuário já fica logado)
await register({ name, email, password });

// Login: salva o token no localStorage (chave "criafacil_token")
const { user } = await login(email, password);

// Usuário logado: retorna o usuário, ou null se não houver login válido
// (token expirado/inválido é apagado automaticamente)
const me = await getMe();
if (!me) router.push("/login");

// Sair: remove o token
logout();
router.push("/login");
```

Como funciona:

- **Token automático:** depois do `login()`, **todas** as funções de `lib/api.ts`
  (`getRecords`, `createRecord`, `updateRecord`, `updateItem`, `deleteRecord`,
  `uploadFile`, `getMe`) enviam `Authorization: Bearer <token>` sozinhas, junto com o
  `x-project-key`. Não adicione esse header manualmente.
- **Proteger uma página:** em um componente `"use client"`, chame `getMe()` dentro de um
  `useEffect`; mostre "carregando" enquanto verifica e redirecione para `/login` se
  retornar `null`.
- **Erros:** `login()`/`register()` lançam `ApiError` em caso de falha (ex.: status 401
  ou 422). Mostre mensagens amigáveis, nunca o erro técnico.
- `isLoggedIn()` só verifica se existe token salvo (rápido, sem chamar a API). Para ter
  certeza de que o login é válido, use `getMe()`.
- `localStorage` só existe no navegador: use os helpers de auth apenas em componentes
  `"use client"`, dentro de `useEffect` ou de handlers de evento. No servidor, o token
  nunca é enviado.

Telas de login/cadastro: simples, mobile-first, com mensagens de erro amigáveis
(ex.: "E-mail ou senha incorretos", "Este e-mail já está cadastrado").

## Design

- **Mobile-first:** a maioria das pessoas vai usar no celular. Comece pelo layout
  de celular e use `sm:`, `md:`, `lg:` para telas maiores.
- Componentes limpos com Tailwind; botões e campos grandes e fáceis de tocar (mín. ~44px).
- Textos da interface em **português do Brasil**.
- Ícones: `lucide-react` (já instalado). Para combinar classes: `clsx` e `tailwind-merge`.
- Sempre mostre estados de carregando, vazio e erro.
- Componentes que usam estado, eventos ou `fetch` no navegador precisam de `"use client"`.
- **Resiliência de dados:** sempre adicione fallbacks caso algum campo salvo venha vazio
  ou nulo de versões anteriores (ex: `item.titulo || 'Item sem nome'`). Registros antigos
  podem não ter campos que foram adicionados depois — a tela nunca deve quebrar por isso.

## Automação de Git (deploy)

### Linguagem com a pessoa usuária

**NUNCA** mencione termos como "Git", "git push", "commit", "repositório" ou "Vercel"
nas suas conversas com o usuário. Trate o processo como uma atualização automática do
aplicativo (exemplo: "Pronto! Já apliquei as alterações e elas estarão disponíveis no
seu aplicativo em instantes").

### Identidade do Git

Antes do primeiro commit, verifique `git config user.name` e `git config user.email`.
Se algum estiver vazio, defina **silenciosamente**, sem perguntar à pessoa usuária,
apenas neste projeto (sem `--global`):

```bash
git config user.name  >/dev/null || git config user.name  "CriaFácil"
git config user.email >/dev/null || git config user.email "app@criafacil.local"
```

### Fluxo

Sempre que concluir ou testar uma funcionalidade pedida pela pessoa usuária:

1. Rode `npm run build` e corrija qualquer erro antes de prosseguir.
2. Faça um commit semântico, por exemplo:
   - `feat: adiciona lista de tarefas`
   - `fix: corrige envio de foto do produto`
   - `style: melhora layout da tela inicial no celular`
3. Execute `git push origin main` para disparar o deploy automático na Vercel.
4. Avise a pessoa, em linguagem simples e sem termos técnicos, que a atualização foi
   aplicada (veja "Linguagem com a pessoa usuária" acima).

Nunca faça commit de `.env.local` nem de segredos.
