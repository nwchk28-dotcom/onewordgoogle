import type { QueryErrorBody, QuerySuccess, Turn } from "./types";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export class QueryApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "QueryApiError";
  }
}

function isSuccess(value: unknown): value is QuerySuccess {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.kind === "clarification" || candidate.kind === "answer") &&
    typeof candidate.text === "string" &&
    (candidate.searchSuggestionHtml === undefined ||
      typeof candidate.searchSuggestionHtml === "string")
  );
}

function isErrorBody(value: unknown): value is QueryErrorBody {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.code === "string" && typeof candidate.message === "string";
}

export async function submitQuery(
  turns: Turn[],
  turnstileToken: string,
  signal?: AbortSignal,
): Promise<QuerySuccess> {
  if (!apiBaseUrl) {
    throw new QueryApiError("CONFIGURATION_ERROR", "APIの設定が必要です", 0);
  }

  const response = await fetch(`${apiBaseUrl}/v1/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      turns,
      turnstileToken,
      locale: navigator.language || "ja-JP",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo",
    }),
    signal,
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new QueryApiError("INVALID_RESPONSE", "応答を読み取れません", response.status);
  }

  if (!response.ok) {
    if (isErrorBody(body)) {
      throw new QueryApiError(body.code, body.message, response.status);
    }
    throw new QueryApiError("REQUEST_FAILED", "検索できませんでした", response.status);
  }

  if (!isSuccess(body)) {
    throw new QueryApiError("INVALID_RESPONSE", "応答を読み取れません", response.status);
  }

  return body;
}

