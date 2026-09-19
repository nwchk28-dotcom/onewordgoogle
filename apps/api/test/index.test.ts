import { describe, expect, it } from "vitest";
import { handleRequest, testing } from "../src/index";

const origin = "https://nwchk28-dotcom.github.io";

function makeEnv(): Env {
  return {
    GEMINI_API_KEY: "gemini-test",
    TURNSTILE_SECRET_KEY: "turnstile-test",
    GEMINI_MODEL: "gemini-2.5-flash",
    ALLOWED_ORIGINS: "https://nwchk28-dotcom.github.io,http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:4173",
    ALLOWED_HOSTNAMES: "nwchk28-dotcom.github.io,localhost,127.0.0.1",
  };
}

function makeRequest(body: unknown, requestOrigin = origin): Request {
  return new Request("https://api.example.test/v1/query", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: requestOrigin },
    body: JSON.stringify(body),
  });
}

function validBody(): Record<string, unknown> {
  return {
    turns: [{ role: "user", text: "明日の港区の天気は？" }],
    turnstileToken: "valid-token",
    locale: "ja-JP",
    timeZone: "Asia/Tokyo",
  };
}

function mockFetch(responses: Array<{ match: string; status?: number; body: unknown }>): typeof fetch {
  return (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const matched = responses.find((response) => url.includes(response.match));
    if (!matched) throw new Error(`Unexpected URL: ${url}`);
    return Promise.resolve(Response.json(matched.body, { status: matched.status ?? 200 }));
  };
}

const turnstileSuccess = {
  success: true,
  hostname: "nwchk28-dotcom.github.io",
  action: "query",
};

describe("request validation", () => {
  it("rejects empty and oversized turns", () => {
    expect(() => testing.validateQueryRequest({ ...validBody(), turns: [] })).toThrow();
    expect(() =>
      testing.validateQueryRequest({
        ...validBody(),
        turns: [{ role: "user", text: "a".repeat(501) }],
      }),
    ).toThrow();
  });

  it("falls back to Tokyo for an invalid time zone", () => {
    const parsed = testing.validateQueryRequest({ ...validBody(), timeZone: "not/a-zone" });
    expect(parsed.timeZone).toBe("Asia/Tokyo");
  });
});

describe("HTTP API", () => {
  it("returns a short clarification without performing search", async () => {
    const fetcher = mockFetch([
      { match: "siteverify", body: turnstileSuccess },
      {
        match: "generateContent",
        body: {
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ action: "clarify", text: "どこの天気ですか？" }) }],
              },
            },
          ],
        },
      },
    ]);
    const response = await handleRequest(makeRequest(validBody()), makeEnv(), fetcher);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ kind: "clarification", text: "どこの天気ですか？" });
  });

  it("returns the grounded answer and Google search entry point", async () => {
    let geminiCall = 0;
    const fetcher: typeof fetch = (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("siteverify")) return Promise.resolve(Response.json(turnstileSuccess));
      geminiCall += 1;
      if (geminiCall === 1) {
        return Promise.resolve(Response.json({
          candidates: [
            { content: { parts: [{ text: JSON.stringify({ action: "answer", text: "" }) }] } },
          ],
        }));
      }
      return Promise.resolve(Response.json({
        candidates: [
          {
            content: { parts: [{ text: "晴れ" }] },
            groundingMetadata: { searchEntryPoint: { renderedContent: "<div>Google Search</div>" } },
          },
        ],
      }));
    };

    const response = await handleRequest(makeRequest(validBody()), makeEnv(), fetcher);
    await expect(response.json()).resolves.toEqual({
      kind: "answer",
      text: "晴れ",
      searchSuggestionHtml: "<div>Google Search</div>",
    });
  });

  it("rejects a failed Turnstile token before Gemini", async () => {
    const fetcher = mockFetch([{ match: "siteverify", body: { success: false, "error-codes": ["timeout-or-duplicate"] } }]);
    const response = await handleRequest(makeRequest(validBody()), makeEnv(), fetcher);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "TURNSTILE_REJECTED" });
  });

  it("rejects unknown origins and malformed JSON", async () => {
    const rejected = await handleRequest(makeRequest(validBody(), "https://evil.example"), makeEnv(), fetch);
    expect(rejected.status).toBe(403);

    const malformed = new Request("https://api.example.test/v1/query", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: "{broken",
    });
    const response = await handleRequest(malformed, makeEnv(), fetch);
    expect(response.status).toBe(400);
  });

  it("maps Gemini quota exhaustion to 429", async () => {
    const fetcher = mockFetch([
      { match: "siteverify", body: turnstileSuccess },
      { match: "generateContent", status: 429, body: { error: "quota" } },
    ]);
    const response = await handleRequest(makeRequest(validBody()), makeEnv(), fetcher);
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ code: "QUOTA_EXCEEDED" });
  });
});
