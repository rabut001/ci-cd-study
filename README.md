# ci-cd-study

CI/CD を **ハンズオンで学ぶ**ための学習用リポジトリです。  
本体は/doc/textbook配下の各ドキュメントで、この手順の通り作業を行うことで、シンプルなToDoアプリを、CI/CDが回せる状態でインターネット上にリリースできます。  
このリポジトリには、手順を一通り実施した結果が格納されています。(tag v0.2.0 "Add due_date to todos")

主要な構成は以下のとおりです。
- **アプリ**: Next.js(フロントエンド) + Supabase(バックエンド) による ToDo 管理（追加・完了・削除・期限）
- **CI**: GitHub Actions（Lint / 型チェック / ユニットテスト / E2E）
- **CD**: Vercel（`main` → Production、PR → Preview）
- **DB**: Supabase（マイグレーション管理、RLS による所有者制御）

詳細な手順は [`doc/textbook/`](doc/textbook/README.md) 配下のフェーズ別ドキュメント（フェーズ1〜6）を参照してください。

## 学べること

| フェーズ | 内容 |
|----------|------|
| 1 | GitHub / Vercel / Supabase のアカウント・連携・シークレット |
| 2 | Docker 開発コンテナ、Supabase CLI、ローカル DB |
| 3 | Next.js アプリ、Auth、RLS 付き `todos` テーブル |
| 4 | Vitest / Playwright、GitHub Actions による品質ゲート |
| 5 | Vercel への CD、Preview / Production デプロイ |
| 6 | マイグレーションを伴う機能追加のリリース一周（`due_date` 追加） |

## 技術スタック

| カテゴリ | 採用技術 |
|----------|----------|
| フロントエンド | Next.js 16（App Router）, React 19, TypeScript |
| バックエンド / DB | Supabase（Auth, PostgreSQL, REST API, RLS） |
| テスト | Vitest, React Testing Library, Playwright |
| CI/CD | GitHub Actions, Vercel |
| 開発環境 | Dev Container（Node 24, pnpm 9, Supabase CLI, Playwright） |

## リポジトリ構成

```
.
├── .devcontainer/          # 開発用 Docker 定義（Dev Containers）
├── .github/workflows/      # GitHub Actions（ci.yml）
├── doc/textbook/           # フェーズ別ハンズオン手順書
├── supabase/
│   ├── config.toml
│   └── migrations/         # DB スキーマ（SQL）
└── web/                    # Next.js アプリ
    ├── e2e/                # Playwright E2E
    └── src/
        ├── app/              # ページ（/, /login）
        ├── components/       # TodoItem など
        └── lib/supabase/     # Supabase クライアント
```

## 前提条件

- **Docker Engine** と **Docker Compose プラグイン**（`docker compose`）が利用できること
- ホストで `docker ps` が sudo なしで実行できること（`docker` グループ所属）
- **Cursor / VS Code** + [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) 拡張（推奨）

本リポジトリの手順書では、Node / pnpm のインストールは **開発コンテナ内**で行う前提です。

## クイックスタート

Docker環境を準備の上、このリポジトリの「`/doc/textbook/`」フォルダ配下のドキュメントをコピーし、その手順に従って作業を進めてください。  
※ドキュメント以外の資産は、手順を進めることで順に作成できるため、このリポジトリからコピー/cloneする必要はありません。手順の実行結果のサンプルと考えてください。

| ドキュメント | 内容 |
|--------------|------|
| [doc/textbook/README.md](doc/textbook/README.md) | 手順全体の概要 |
| [phase1-accounts-and-secrets.md](doc/textbook/phase1-accounts-and-secrets.md) | アカウント・シークレットの準備 |
| [phase2-local-dev-environment.md](doc/textbook/phase2-local-dev-environment.md) | 開発環境の準備 |
| [phase3-app-foundation.md](doc/textbook/phase3-app-foundation.md) | アプリの土台の準備 |
| [phase4-quality-gates.md](doc/textbook/phase4-quality-gates.md) | テスト・CIの準備 |
| [phase5-cd-deployment.md](doc/textbook/phase5-cd-deployment.md) | CD・デプロイの準備 |
| [phase6-ship-a-change.md](doc/textbook/phase6-ship-a-change.md) | CI/CDを通した機能追加の実演 |



## CI / CD

### GitHub Actions（`.github/workflows/ci.yml`）

| ジョブ | 内容 |
|--------|------|
| `quality` | lint → typecheck → test → build |
| `e2e` | ランナー内で Supabase を起動し、Playwright スモーク 1 本を実行 |

`pull_request` と `main` への `push` で起動します。`e2e` は `quality` 成功後に実行されます。

CI の `build` には GitHub Secrets の以下が必要です。

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Vercel デプロイ

- **`main` マージ** → Production 自動デプロイ
- **Pull Request** → Preview デプロイ

Vercel の Environment Variables にも `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定してください。Supabase 側では Vercel の URL を Auth の Site URL / Redirect URLs に登録します（手順は [`doc/textbook/phase5-cd-deployment.md`](doc/textbook/phase5-cd-deployment.md)）。

## アプリ機能

- メール / パスワードによるサインアップ・ログイン（Supabase Auth）
- ToDo の追加・完了切り替え・削除
- 期限（`due_date`）の入力・一覧での編集
- 行レベルセキュリティ（RLS）により、ログインユーザー自身の ToDo のみアクセス可能



