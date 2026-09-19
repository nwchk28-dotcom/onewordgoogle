import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { QueryApiError, submitQuery } from "./api";
import { TurnstileController } from "./turnstile";
import type { Turn } from "./types";

type Phase = "idle" | "loading" | "clarifying" | "answered" | "error";

const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";

function displayError(error: unknown): string {
  if (error instanceof QueryApiError) {
    if (error.status === 429) return "今日の上限です";
    if (error.status === 403) return "確認できませんでした";
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "検索できませんでした";
}

export default function App() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [searchSuggestionHtml, setSearchSuggestionHtml] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const turnstileRef = useRef<TurnstileController | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new TurnstileController();
    turnstileRef.current = controller;
    const container = turnstileContainerRef.current;
    if (container) {
      void controller
        .init(container, siteKey)
        .then(() => {
          if (cancelled) controller.destroy();
        })
        .catch((caught: unknown) => {
          if (!cancelled) {
            setError(displayError(caught));
            setPhase("error");
          }
        });
    }
    return () => {
      cancelled = true;
      abortRef.current?.abort();
      controller.destroy();
      turnstileRef.current = null;
    };
  }, []);

  const locked = phase === "loading" || phase === "answered";

  async function send(): Promise<void> {
    const question = input.trim();
    if (!question || locked || inFlightRef.current || !turnstileRef.current) return;
    inFlightRef.current = true;

    const nextTurns: Turn[] = [...turns, { role: "user", text: question }];
    setTurns(nextTurns);
    setInput("");
    setError("");
    setSearchSuggestionHtml("");
    setPhase("loading");

    const abortController = new AbortController();
    abortRef.current = abortController;
    try {
      const token = await turnstileRef.current.execute();
      const result = await submitQuery(nextTurns, token, abortController.signal);
      setTurns((current) => [...current, { role: "assistant", text: result.text }]);
      setSearchSuggestionHtml(result.searchSuggestionHtml ?? "");
      setPhase(result.kind === "answer" ? "answered" : "clarifying");
      if (result.kind === "clarification") {
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
    } catch (caught: unknown) {
      if (abortController.signal.aborted) return;
      setError(displayError(caught));
      setPhase("error");
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } finally {
      if (abortRef.current === abortController) abortRef.current = null;
      inFlightRef.current = false;
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void send();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  function reset(): void {
    abortRef.current?.abort();
    inFlightRef.current = false;
    setTurns([]);
    setInput("");
    setError("");
    setSearchSuggestionHtml("");
    setPhase("idle");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  let lastAssistantIndex = -1;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    if (turns[index]?.role === "assistant") {
      lastAssistantIndex = index;
      break;
    }
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="一言検索 ホーム">
          <span className="brand-mark" aria-hidden="true">●</span>
          <span>一言検索</span>
        </a>
        <span className="prototype-badge">プロトタイプ</span>
      </header>

      <main className={`search-stage search-stage--${phase}`}>
        {turns.length === 0 && (
          <section className="hero" aria-labelledby="hero-title">
            <p className="eyebrow">JUST THE ANSWER</p>
            <h1 id="hero-title">聞いたことだけ。</h1>
            <p>長い説明は省いて、答えをできるだけ短く返します。</p>
          </section>
        )}

        {turns.length > 0 && (
          <section className="conversation" aria-label="検索の会話">
            {turns.map((turn, index) => (
              <article
                className={`message message--${turn.role} ${
                  index === lastAssistantIndex ? "message--latest" : ""
                }`}
                key={`${turn.role}-${index}`}
              >
                <span className="message-label">{turn.role === "user" ? "YOU" : "ANSWER"}</span>
                <p>{turn.text}</p>
              </article>
            ))}
            {phase === "loading" && (
              <div className="thinking" role="status">
                <span />
                <span />
                <span />
                <span className="sr-only">検索中</span>
              </div>
            )}
            {searchSuggestionHtml && (
              <aside className="google-suggestions" aria-label="Google 検索候補">
                <span className="suggestion-label">Google 検索</span>
                <div
                  // Only Google's searchEntryPoint.renderedContent reaches this property.
                  dangerouslySetInnerHTML={{ __html: searchSuggestionHtml }}
                />
              </aside>
            )}
          </section>
        )}

        <div className="composer-wrap">
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}

          <form className="composer" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="question">質問</label>
            <textarea
              id="question"
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={phase === "clarifying" ? "条件を教えてください" : "例：メッシの年齢は？"}
              maxLength={500}
              rows={1}
              disabled={locked}
              autoFocus
            />
            <button type="submit" disabled={locked || input.trim().length === 0} aria-label="送信">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>

          {phase === "answered" ? (
            <button className="new-search" type="button" onClick={reset}>
              新しい検索
            </button>
          ) : (
            <p className="input-hint">Enterで送信 · Shift + Enterで改行</p>
          )}
        </div>

        <div ref={turnstileContainerRef} className="turnstile-slot" aria-label="人間確認" />
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {phase === "loading"
            ? "検索中です"
            : lastAssistantIndex >= 0
              ? turns[lastAssistantIndex]?.text
              : error}
        </div>
      </main>

      <footer>
        <p>18歳以上向けの開発中プロトタイプ</p>
        <details>
          <summary>利用上の注意</summary>
          <p>
            入力内容はGoogleに送信されます。Google検索を使った場合、入力と出力は最大30日間保存されます。重要な判断には一次情報も確認してください。
          </p>
        </details>
      </footer>
    </div>
  );
}
