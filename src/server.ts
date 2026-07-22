import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

type RuntimeEnv = Record<string, unknown>;

type BrasilApiCnpjPayload = Record<string, unknown>;

type BrasilApiLookupResult =
  | { ok: true; payload: BrasilApiCnpjPayload; source: string }
  | { ok: false; status: number; message: string; source: string };

const CNPJ_PROVIDERS = [
  {
    name: "BrasilAPI",
    url: (cnpj: string) => `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
  },
  {
    name: "Minha Receita",
    url: (cnpj: string) => `https://minhareceita.org/${cnpj}`,
  },
] as const;

let serverEntryPromise: Promise<ServerEntry> | undefined;

function jsonResponse(payload: Record<string, unknown>, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init?.headers,
    },
  });
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function readEnv(env: unknown, key: string): string | undefined {
  const runtimeValue = env && typeof env === "object" ? (env as RuntimeEnv)[key] : undefined;
  if (typeof runtimeValue === "string" && runtimeValue) return runtimeValue;

  const viteValue = (import.meta.env as Record<string, string | undefined>)[key];
  return typeof viteValue === "string" && viteValue ? viteValue : undefined;
}

function readString(payload: BrasilApiCnpjPayload, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
}

function hasSupplierEmail(payload: BrasilApiCnpjPayload): boolean {
  return Boolean(readString(payload, "email"));
}

function mergeCnpjPayload(
  primary: BrasilApiCnpjPayload,
  fallback: BrasilApiCnpjPayload,
): BrasilApiCnpjPayload {
  const merged = { ...primary };

  for (const [key, value] of Object.entries(fallback)) {
    const current = merged[key];
    if (current !== null && current !== undefined && current !== "") continue;
    if (value === null || value === undefined || value === "") continue;
    merged[key] = value;
  }

  return merged;
}

function formatCnpj(cnpj: string): string {
  const digits = onlyDigits(cnpj);
  if (digits.length !== 14) return cnpj;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function formatCep(cep: string): string {
  const digits = onlyDigits(cep);
  if (digits.length !== 8) return cep;
  return digits.replace(/^(\d{5})(\d{3})$/, "$1-$2");
}

function formatPhone(phone: string): string {
  const digits = onlyDigits(phone);
  if (digits.length === 10) {
    return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  }
  if (digits.length === 11) {
    return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  }
  return phone;
}

function buildAddress(payload: BrasilApiCnpjPayload): string {
  const street = [
    readString(payload, "descricao_tipo_de_logradouro"),
    readString(payload, "logradouro"),
  ]
    .filter(Boolean)
    .join(" ");
  const number = readString(payload, "numero");
  const complement = readString(payload, "complemento");
  const neighborhood = readString(payload, "bairro");
  const cityState = [readString(payload, "municipio"), readString(payload, "uf")]
    .filter(Boolean)
    .join("/");
  const cep = formatCep(readString(payload, "cep"));

  const firstLine = [street, number].filter(Boolean).join(", ");
  return [firstLine, complement, neighborhood, cityState, cep].filter(Boolean).join(" - ");
}

function normalizeBrasilApiSupplier(
  payload: BrasilApiCnpjPayload,
  source: string,
): Record<string, unknown> {
  const phone = readString(payload, "ddd_telefone_1") || readString(payload, "ddd_telefone_2");

  return {
    name: readString(payload, "razao_social") || readString(payload, "nome_fantasia"),
    trade_name: readString(payload, "nome_fantasia"),
    document: formatCnpj(readString(payload, "cnpj")),
    contact: phone ? formatPhone(phone) : "",
    email: readString(payload, "email").toLowerCase(),
    address: buildAddress(payload),
    status: readString(payload, "descricao_situacao_cadastral"),
    source,
  };
}

function extractBrasilApiError(payload: unknown, body: string): string {
  if (payload && typeof payload === "object") {
    const fields = payload as Record<string, unknown>;
    const message = fields.message ?? fields.error ?? fields.name;
    if (typeof message === "string" && message.trim()) return message.trim();
  }

  return body.trim().slice(0, 180);
}

async function fetchBrasilApiCnpj(cnpj: string): Promise<BrasilApiLookupResult> {
  let lastError: BrasilApiLookupResult | null = null;
  let bestResult: Extract<BrasilApiLookupResult, { ok: true }> | null = null;

  for (const provider of CNPJ_PROVIDERS) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(provider.url(cnpj), {
          cache: "no-store",
          headers: {
            accept: "application/json",
            "cache-control": "no-cache",
          },
        });
        const body = await response.text();
        const payload = body ? (JSON.parse(body) as BrasilApiCnpjPayload) : null;

        if (response.ok && payload) {
          bestResult = bestResult
            ? {
                ok: true,
                payload: mergeCnpjPayload(bestResult.payload, payload),
                source: `${bestResult.source} + ${provider.name}`,
              }
            : { ok: true, payload, source: provider.name };

          if (hasSupplierEmail(bestResult.payload)) {
            return bestResult;
          }

          break;
        }

        lastError = {
          ok: false,
          status: response.status,
          message: extractBrasilApiError(payload, body),
          source: provider.name,
        };

        if (response.status < 500 && response.status !== 429) {
          break;
        }
      } catch (error) {
        lastError = {
          ok: false,
          status: 0,
          message:
            error instanceof Error ? error.message : `Falha de conexão com ${provider.name}.`,
          source: provider.name,
        };
      }
    }
  }

  if (bestResult) return bestResult;

  return (
    lastError ?? {
      ok: false,
      status: 0,
      message: "Nenhum provedor respondeu à consulta.",
      source: "Consulta CNPJ",
    }
  );
}

async function validateSupabaseSession(request: Request, env: unknown): Promise<boolean> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;

  const supabaseUrl = readEnv(env, "VITE_SUPABASE_URL")?.replace(/\/$/, "");
  const anonKey = readEnv(env, "VITE_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !anonKey) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      authorization,
    },
  });

  return response.ok;
}

async function handleCnpjLookup(request: Request, env: unknown): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse(
      { error: "Método não permitido. Use GET para consultar CNPJ." },
      { status: 405, headers: { allow: "GET" } },
    );
  }

  let hasSession = false;
  try {
    hasSession = await validateSupabaseSession(request, env);
  } catch (error) {
    console.error(error);
    return jsonResponse(
      { error: "Não foi possível validar a sessão do usuário." },
      { status: 500 },
    );
  }

  if (!hasSession) {
    return jsonResponse({ error: "Faça login para consultar CNPJ." }, { status: 401 });
  }

  const url = new URL(request.url);
  const cnpj = onlyDigits(url.searchParams.get("cnpj") ?? "");

  if (cnpj.length !== 14) {
    return jsonResponse({ error: "Informe um CNPJ com 14 dígitos." }, { status: 400 });
  }

  const brasilApiResponse = await fetchBrasilApiCnpj(cnpj);

  if (!brasilApiResponse.ok && brasilApiResponse.status === 404) {
    return jsonResponse({ error: "CNPJ não encontrado na BrasilAPI." }, { status: 404 });
  }

  if (!brasilApiResponse.ok) {
    const upstreamStatus = brasilApiResponse.status || "sem status";
    return jsonResponse(
      {
        error: `Não foi possível consultar o CNPJ (${upstreamStatus}). Tente novamente em instantes.`,
        detail: brasilApiResponse.message,
        source: brasilApiResponse.source,
        upstreamStatus: brasilApiResponse.status,
      },
      { status: 502 },
    );
  }

  return jsonResponse(
    normalizeBrasilApiSupplier(brasilApiResponse.payload, brasilApiResponse.source),
  );
}

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/cnpj") {
        return await handleCnpjLookup(request, env);
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
