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
import { getRecords, createRecord, updateRecord, deleteRecord, uploadFile } from "@/lib/api";

const { data, meta } = await getRecords("tarefas", { page: "1" }); // GET  /tarefas
const nova = await createRecord("tarefas", { titulo: "Comprar pão" }); // POST /tarefas
await updateRecord("tarefas", nova.id, { feita: true });              // PUT  /tarefas/{id}
await deleteRecord("tarefas", nova.id);                               // DELETE /tarefas/{id}
const { url } = await uploadFile(file);                               // POST /storage/upload
```

- Nomes de coleções (ex.: `tarefas`, `clientes`, `produtos`): use minúsculas, no
  plural, sem acentos e sem espaços.
- `getRecords` retorna a paginação do Laravel: `{ data: [...], meta: {...} }`. A lista
  está em `.data`.
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

## Design

- **Mobile-first:** a maioria das pessoas vai usar no celular. Comece pelo layout
  de celular e use `sm:`, `md:`, `lg:` para telas maiores.
- Componentes limpos com Tailwind; botões e campos grandes e fáceis de tocar (mín. ~44px).
- Textos da interface em **português do Brasil**.
- Ícones: `lucide-react` (já instalado). Para combinar classes: `clsx` e `tailwind-merge`.
- Sempre mostre estados de carregando, vazio e erro.
- Componentes que usam estado, eventos ou `fetch` no navegador precisam de `"use client"`.

## Automação de Git (deploy)

Sempre que concluir ou testar uma funcionalidade pedida pela pessoa usuária:

1. Rode `npm run build` e corrija qualquer erro antes de prosseguir.
2. Faça um commit semântico, por exemplo:
   - `feat: adiciona lista de tarefas`
   - `fix: corrige envio de foto do produto`
   - `style: melhora layout da tela inicial no celular`
3. Execute `git push origin main` para disparar o deploy automático na Vercel.
4. Avise a pessoa, em linguagem simples, que a atualização foi publicada.

Nunca faça commit de `.env.local` nem de segredos.
