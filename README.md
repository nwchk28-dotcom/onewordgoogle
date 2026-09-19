# 一言検索

聞かれたことだけを、できるだけ短く返す一問完結型の検索プロトタイプです。

- Web: React + TypeScript + Vite / GitHub Pages
- API: Cloudflare Workers
- Search: Gemini API + Grounding with Google Search
- Abuse protection: Cloudflare Turnstile

## 重要な前提

この初版は、18歳以上のユーザーによる評価用の公開プロトタイプです。Google検索グラウンディングでは、Googleがプロンプトと出力を30日間保存します。一般消費者向けの正式サービスに移行する際は、Googleの現行規約と料金を改めて確認してください。

## ローカル開発

必要環境: Node.js 24以上、npm 11以上。

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.dev.vars.example apps/api/.dev.vars
npm run dev:api
```

別のターミナルで以下を実行します。

```bash
npm run dev:web
```

`apps/api/.dev.vars`の`GEMINI_API_KEY`に[Google AI Studio](https://aistudio.google.com/app/apikey)で発行したAPIキーを設定してください。サンプルのTurnstileキーは常に成功する公式テスト用です。

## 確認コマンド

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

E2Eテストの初回はChromiumが必要です。

```bash
npx playwright install chromium
```

## 初回の公開設定

### 1. Gemini API

1. Google AI StudioでAPIキーを発行します。
2. 料金ページでモデルとGoogle検索の現行上限を確認します。
3. リポジトリのGitHub Secret `GEMINI_API_KEY`に登録します。

### 2. Cloudflare Worker

1. CloudflareでWorkersが使えるアカウントを用意します。
2. `Edit Cloudflare Workers`のみにスコープを絞ったAPIトークンを作成します。
3. 以下をGitHub Secretsに登録します。

| Secret | 値 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Workerデプロイ用の限定APIトークン |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |
| `GEMINI_API_KEY` | Google AI StudioのAPIキー |
| `TURNSTILE_SECRET_KEY` | 本番Turnstileのシークレットキー |

Workerの既定名は`oneword-search-api`です。初回push後、Cloudflareに表示される`workers.dev`のURLを控えてください。

### 3. Turnstile

1. CloudflareでTurnstileウィジェットを作成します。
2. 許可hostnameに`nwchk28-dotcom.github.io`を登録します。
3. Site keyをGitHub Variable `VITE_TURNSTILE_SITE_KEY`に、Secret keyを上記のGitHub Secretに登録します。

### 4. GitHub Pages

1. GitHubの`Settings > Pages > Build and deployment`で公開元を`GitHub Actions`にします。
2. GitHub Variable `VITE_API_BASE_URL`にWorker URLを設定します。末尾の`/`は不要です。
3. `main`へpushすると、テスト後にGitHub PagesとWorkerが自動デプロイされます。

> 最初のpushではWorker URLが未確定のため、Workerのデプロイ完了後に`VITE_API_BASE_URL`を設定し、もう1回pushまたはActionsを手動実行してください。

## API

### `POST /v1/query`

```json
{
  "turns": [{ "role": "user", "text": "明日の港区の天気は？" }],
  "turnstileToken": "...",
  "locale": "ja-JP",
  "timeZone": "Asia/Tokyo"
}
```

成功時:

```json
{
  "kind": "answer",
  "text": "晴れ",
  "searchSuggestionHtml": "..."
}
```

`searchSuggestionHtml`はGoogle APIが返した`searchEntryPoint.renderedContent`のみで、検索が実行されなかった場合は含まれません。

### `GET /health`

```json
{ "ok": true }
```

## 運用メモ

- 検索結果や会話は保存しません。
- Workerのログにはステータス、所要時間、エラー種別だけを記録します。
- GeminiまたはGoogle検索の上限時は、自動で有料モデルに切り替えません。
- カスタムドメインを追加する場合は、`ALLOWED_ORIGINS`、`ALLOWED_HOSTNAMES`、Turnstileのhostname、WebのCSPを同時に更新してください。

## 参考

- [Gemini API: Grounding with Google Search](https://ai.google.dev/gemini-api/docs/google-search)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/)
- [Cloudflare Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

