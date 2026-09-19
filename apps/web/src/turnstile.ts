interface TurnstileOptions {
  sitekey: string;
  action: string;
  execution: "execute";
  appearance: "interaction-only";
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
}

interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileOptions): string;
  execute(widgetId: string): void;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

async function waitForApi(timeoutMs = 10_000): Promise<TurnstileApi> {
  const startedAt = Date.now();
  while (!window.turnstile) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("人間確認を読み込めません");
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
  }
  return window.turnstile;
}

export class TurnstileController {
  private api: TurnstileApi | null = null;
  private widgetId: string | null = null;
  private resolveToken: ((token: string) => void) | null = null;
  private rejectToken: ((reason: Error) => void) | null = null;

  async init(container: HTMLElement, siteKey: string): Promise<void> {
    if (!siteKey) throw new Error("Turnstileの設定が必要です");
    this.api = await waitForApi();
    this.widgetId = this.api.render(container, {
      sitekey: siteKey,
      action: "query",
      execution: "execute",
      appearance: "interaction-only",
      callback: (token) => {
        this.resolveToken?.(token);
        this.clearPending();
      },
      "error-callback": () => this.fail("人間確認に失敗しました"),
      "expired-callback": () => this.fail("人間確認の期限が切れました"),
    });
  }

  execute(): Promise<string> {
    if (!this.api || !this.widgetId) {
      return Promise.reject(new Error("人間確認の準備中です"));
    }
    if (this.resolveToken) {
      return Promise.reject(new Error("送信処理中です"));
    }

    this.api.reset(this.widgetId);
    const token = new Promise<string>((resolve, reject) => {
      this.resolveToken = resolve;
      this.rejectToken = reject;
    });
    this.api.execute(this.widgetId);
    return token;
  }

  destroy(): void {
    if (this.api && this.widgetId) this.api.remove(this.widgetId);
    this.fail("人間確認が中断されました");
    this.widgetId = null;
    this.api = null;
  }

  private fail(message: string): void {
    this.rejectToken?.(new Error(message));
    this.clearPending();
  }

  private clearPending(): void {
    this.resolveToken = null;
    this.rejectToken = null;
  }
}

