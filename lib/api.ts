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

/** Registro genérico retornado pela API (sempre possui `id`). */
export type ApiRecord<T = Record<string, unknown>> = T & { id: string | number };

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
 * Lista registros de uma coleção.
 * Retorna `{ data, meta }` (paginação do Laravel).
 * @example const { data } = await getRecords("tarefas", { page: "2" });
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
  return unwrap<ApiRecord<T>>(body);
}

/**
 * Atualiza um registro. O payload é enviado como `{ data: payload }`.
 * @example await updateRecord("tarefas", 1, { feita: true });
 */
export async function updateRecord<T = Record<string, unknown>>(
  collection: string,
  id: string | number,
  payload: object,
): Promise<ApiRecord<T>> {
  const body = await request<unknown>(
    `${collection}/${encodeURIComponent(String(id))}`,
    {
      method: "PUT",
      body: JSON.stringify({ data: payload }),
    },
  );
  return unwrap<ApiRecord<T>>(body);
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
