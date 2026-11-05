/**
 * Cliente HTTP do CriaFácil para o BaaS Laravel central.
 *
 * Regras:
 * - Toda requisição envia o header `x-project-key`.
 * - Todo POST/PUT de dados é envelopado em `{ data: payload }`.
 * - Arquivos NUNCA vão em Base64 no JSON: use `uploadFile()` e salve a URL.
 */

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "https://api-criafacil.goes.dev.br/api/v1"
).replace(/\/+$/, "");

const PROJECT_KEY = process.env.NEXT_PUBLIC_PROJECT_KEY || "";

/** Resposta paginada padrão do Laravel. */
export interface PaginatedResponse<T> {
  data: T[];
  meta?: {
    current_page?: number;
    last_page?: number;
    per_page?: number;
    total?: number;
    [key: string]: unknown;
  };
  links?: Record<string, string | null>;
}

/**
 * Registro como vem da API. Os campos do usuário ficam DENTRO de `data`:
 * `{ id, collection, data: { ... }, created_at }`.
 */
export interface ApiRecord<T = Record<string, unknown>> {
  id: number;
  collection: string;
  data: T;
  created_at: string;
  updated_at?: string;
}

/** Registro "achatado" para uso no React: `{ id, ...data }`. */
export type Item<T = Record<string, unknown>> = T & { id: number };

/**
 * Converte um registro da API em item achatado: `{ id: item.id, ...item.data }`.
 */
export function toItem<T = Record<string, unknown>>(record: ApiRecord<T>): Item<T> {
  return { ...record.data, id: record.id };
}

/**
 * Converte a lista de registros da API em itens achatados.
 * @example const itens = toItems(response.data);
 */
export function toItems<T = Record<string, unknown>>(records: ApiRecord<T>[]): Item<T>[] {
  return records.map((record) => toItem(record));
}

/** Erro lançado quando a API responde com status fora de 2xx. */
export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/* -------------------------------------------------------------------------- */
/*                               Token de login                               */
/* -------------------------------------------------------------------------- */

/** Chave do `localStorage` onde o token de login é guardado. */
export const TOKEN_STORAGE_KEY = "criafacil_token";

/** Retorna o token salvo, ou `null` (sempre `null` no servidor). */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Salva o token no `localStorage`. */
export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

/** Remove o token do `localStorage`. */
export function clearToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

/** Indica se existe um token salvo (não valida com a API — para isso use `getMe()`). */
export function isLoggedIn(): boolean {
  return Boolean(getToken());
}

function buildUrl(path: string, params?: Record<string, string>): string {
  const url = `${API_URL}/${path.replace(/^\/+/, "")}`;
  if (!params || Object.keys(params).length === 0) return url;
  return `${url}?${new URLSearchParams(params).toString()}`;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  params?: Record<string, string>,
): Promise<T> {
  if (!PROJECT_KEY) {
    console.warn(
      "[api] NEXT_PUBLIC_PROJECT_KEY não está definida. Configure-a no arquivo .env.local.",
    );
  }

  const headers = new Headers(init.headers);
  headers.set("x-project-key", PROJECT_KEY);
  headers.set("Accept", "application/json");
  // Anexa o token do usuário logado, se existir (apenas no navegador).
  const token = getToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  // Não define Content-Type para FormData: o navegador adiciona o boundary.
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(buildUrl(path, params), {
    ...init,
    headers,
    cache: "no-store",
  });

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const message =
      (body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : null) || `Erro ${response.status} ao acessar ${path}`;
    throw new ApiError(response.status, message, body);
  }

  return body as T;
}

/** Remove o envelope `{ data: ... }` de respostas de item único, se existir. */
function unwrap<T>(body: unknown): T {
  if (body && typeof body === "object" && "data" in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

/**
 * Extrai o registro de uma resposta de item único. Aceita tanto o registro puro
 * `{ id, collection, data }` quanto o envelope de Resource `{ data: { id, ... } }`.
 * (Não usa `unwrap`, pois o próprio registro tem uma chave `data`.)
 */
function unwrapRecord<T>(body: unknown): ApiRecord<T> {
  if (body && typeof body === "object" && !("id" in body) && "data" in body) {
    return (body as { data: ApiRecord<T> }).data;
  }
  return body as ApiRecord<T>;
}

/**
 * Lista registros de uma coleção.
 * Retorna `{ data, meta }` (paginação do Laravel). Cada registro vem como
 * `{ id, collection, data: { ... }, created_at }` — use `toItems()` para achatar.
 * @example
 * const response = await getRecords("tarefas", { page: "2" });
 * const itens = response.data.map(item => ({ id: item.id, ...item.data }));
 */
export async function getRecords<T = Record<string, unknown>>(
  collection: string,
  params?: Record<string, string>,
): Promise<PaginatedResponse<ApiRecord<T>>> {
  const body = await request<PaginatedResponse<ApiRecord<T>> | ApiRecord<T>[]>(
    collection,
    { method: "GET" },
    params,
  );
  // Tolera respostas não paginadas (array puro).
  if (Array.isArray(body)) return { data: body };
  return { ...body, data: body?.data ?? [] };
}

/**
 * Cria um registro. O payload é enviado como `{ data: payload }`.
 * @example await createRecord("tarefas", { titulo: "Comprar pão" });
 */
export async function createRecord<T = Record<string, unknown>>(
  collection: string,
  payload: object,
): Promise<ApiRecord<T>> {
  const body = await request<unknown>(collection, {
    method: "POST",
    body: JSON.stringify({ data: payload }),
  });
  return unwrapRecord<T>(body);
}

/**
 * Substitui TODO o conteúdo de um registro. O payload é enviado como `{ data: payload }`.
 *
 * ⚠️ O PUT sobrescreve a coluna `data` inteira: campos ausentes no payload são APAGADOS.
 * Envie sempre o objeto completo. Para alterar só alguns campos, use `updateItem()`.
 * @example await updateRecord("tarefas", 1, { ...tarefaCompleta, concluida: true });
 */
export async function updateRecord<T = Record<string, unknown>>(
  collection: string,
  id: string | number,
  payload: T,
): Promise<ApiRecord<T>> {
  const body = await request<unknown>(
    `${collection}/${encodeURIComponent(String(id))}`,
    {
      method: "PUT",
      body: JSON.stringify({ data: payload }),
    },
  );
  return unwrapRecord<T>(body);
}

/**
 * Forma SEGURA de alterar campos de um item: mescla o item atual completo
 * (achatado, com `id`) com as alterações e envia o payload inteiro no PUT,
 * preservando todos os campos existentes.
 * @example
 * await updateItem("tarefas", tarefa, { concluida: true });
 */
export async function updateItem<T extends Record<string, unknown>>(
  collection: string,
  item: Item<T>,
  changes: Partial<T>,
): Promise<Item<T>> {
  const { id, ...current } = item;
  const payload = { ...current, ...changes } as unknown as T;
  const record = await updateRecord<T>(collection, id, payload);
  return record && record.data ? toItem(record) : ({ ...payload, id } as Item<T>);
}

/**
 * Exclui um registro.
 * @example await deleteRecord("tarefas", 1);
 */
export async function deleteRecord(
  collection: string,
  id: string | number,
): Promise<void> {
  await request<unknown>(`${collection}/${encodeURIComponent(String(id))}`, {
    method: "DELETE",
  });
}

/**
 * Envia um arquivo para o storage (Cloudflare R2) e retorna a URL pública.
 * Salve a URL retornada no JSON do registro — nunca o arquivo em Base64.
 * @example const { url } = await uploadFile(file);
 */
export async function uploadFile(file: File): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const body = await request<{ url: string } | { data: { url: string } }>(
    "storage/upload",
    { method: "POST", body: formData },
  );
  const result = "url" in body ? body : unwrap<{ url: string }>(body);
  if (!result?.url) {
    throw new ApiError(500, "Upload concluído, mas a API não retornou a URL.", body);
  }
  return { url: result.url };
}

/* -------------------------------------------------------------------------- */
/*                         Autenticação de usuários                           */
/* -------------------------------------------------------------------------- */
/* As rotas de auth NÃO usam o envelope `{ data: ... }`.                      */

/** Usuário retornado pela API de auth. */
export interface AuthUser {
  id: number | string;
  name: string;
  email: string;
  [key: string]: unknown;
}

/** Resposta do login: `{ token, user }`. */
export interface AuthResponse {
  token: string;
  user: AuthUser;
}

/** Extrai o usuário de respostas como `{ user }`, `{ data }` ou o usuário puro. */
function extractUser(body: unknown): AuthUser {
  if (body && typeof body === "object") {
    if ("user" in body) return (body as { user: AuthUser }).user;
    if (!("email" in body) && "data" in body) return (body as { data: AuthUser }).data;
  }
  return body as AuthUser;
}

/**
 * Cadastra um novo usuário. Se a API já devolver um token, ele é salvo
 * (o usuário fica logado automaticamente).
 * @example await register({ name: "Maria", email: "maria@email.com", password: "segredo123" });
 */
export async function register(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ token?: string; user?: AuthUser }> {
  const body = await request<Record<string, unknown> | null>("auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const token = body && typeof body.token === "string" ? body.token : undefined;
  if (token) setToken(token);
  return { token, user: body ? extractUser(body) : undefined };
}

/**
 * Faz login e salva o token no `localStorage`. A partir daí, todas as funções
 * deste arquivo enviam `Authorization: Bearer <token>` automaticamente.
 * @example const { user } = await login("maria@email.com", "segredo123");
 */
export async function login(email: string, password: string): Promise<AuthResponse> {
  clearToken(); // evita enviar um token antigo/expirado no login
  const body = await request<AuthResponse>("auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!body?.token) {
    throw new ApiError(500, "Login concluído, mas a API não retornou o token.", body);
  }
  setToken(body.token);
  return body;
}

/**
 * Retorna o usuário logado, ou `null` se não houver login válido.
 * Se o token estiver expirado/inválido (401), ele é apagado.
 * @example const user = await getMe(); if (!user) router.push("/login");
 */
export async function getMe(): Promise<AuthUser | null> {
  if (!getToken()) return null;
  try {
    const body = await request<unknown>("auth/me", { method: "GET" });
    return extractUser(body);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearToken();
      return null;
    }
    throw error;
  }
}

/**
 * Sai da conta: remove o token do `localStorage`.
 * @example logout(); router.push("/login");
 */
export function logout(): void {
  clearToken();
}
