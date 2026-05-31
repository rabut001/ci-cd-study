# CI/CD 学習用ワークフロー整理（ToDo アプリ前提）

前提とする環境:

- **展開先**: Vercel / Supabase
- **ソース管理**: GitHub
- **CI/CD 管理**: GitHub Actions
- **フレームワーク**: Next.js / TypeScript
- **開発アプリ**: シンプルな ToDo アプリ
- **開発の置き場**: **Ubuntu 上の Docker**（Docker Engine + Docker Compose プラグイン）で開発用コンテナを動かし、Node / パッケージインストール / `next dev` などは原則そのコンテナ内で行う。

開発に入る前に、行うべきタスクをフェーズ分けして整理する。

---

## フェーズ0：ゴールの定義

各フェーズのゴール、つまり、「何ができていれば完了か」をまとめると以下の通り。

- **アカウント・シークレット**（フェーズ1）: GitHub / Vercel / Supabase のアカウントと連携が整い、**Project URL** / **anon public キー**を安全な場所に控えてある。
- **開発環境**（フェーズ2）: 事前導入済みの Docker 上に **開発用コンテナ**が立ち、**Supabase CLI でローカル DB** を起動できる。ルート `.gitignore` を置いてから Git を初期化し、初回コミットを push 済み。
- **アプリの土台**（フェーズ3）: `web/` の Next.js（TypeScript）から Supabase Auth（メール / パスワード）でログインでき、`todos` を **RLS（`auth.uid()` による所有者制御）** 付きで読み書きできる。スキーマは **マイグレーション**で管理する。
- **品質ゲート**（フェーズ4）: PR / `main` で **Lint・型チェック・ユニットテスト・E2E スモーク**が通り、失敗時はマージしない運用になっている。
- **CD（デプロイ）**（フェーズ5）: `main` へのマージで **Vercel の Production が更新**され、PR では **Preview** が出る。
- **リリースを一周**（フェーズ6）: マイグレーションを伴う機能変更を、ブランチ → PR → CI → Preview → マージ → 本番反映まで一周できる。

---

## フェーズ1：アカウント・連携・シークレット

| タスク | 内容 |
|--------|------|
| **GitHub** | リポジトリ用アカウント・組織の決定。2FA 推奨。 |
| **Vercel** | アカウント作成 → GitHub と連携 → 対象リポジトリのインポート許可（Project の Import はフェーズ5）。 |
| **Supabase** | アカウント作成 → **新規プロジェクト**（リージョンはユーザーに近い所）。**Email** プロバイダを有効にする（フェーズ1）。 |
| **APIキー・接続情報** | Supabase ダッシュボードの **Project URL**、**anon public**、（サーバー用なら **service_role** は Git に載せない）。必要なら **Database URL**（マイグレーション用）。 |
| **GitHub Secrets** | CI や将来の自動マイグレーション用に、必要になった時点で `SUPABASE_ACCESS_TOKEN` などを登録（最初は最小でよい）。 |
| **Vercel Environment Variables** | フェーズ5で Project Import 後、`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY` を Production / Preview に設定。 |

この段階では「キーを `.env.local`（または Compose の `env_file`）に置く」「本番は Vercel の環境変数」と役割を分ける、まで押さえておくと後が楽。

---

## フェーズ2：Ubuntu + Docker 上の開発環境

| タスク | 内容 |
|--------|------|
| **Ubuntu と Docker（前提・範囲外）** | **Docker Engine** と **Docker Compose プラグイン**（`docker compose`）が Ubuntu に導入済みで、ユーザーが `docker` グループに入っている（`docker ps` が sudo なしで動く）ことを前提とする。これらのインストール・権限設定は本手順書では扱わない。 |
| **開発用コンテナ** | **`.devcontainer/Dockerfile`** と **`.devcontainer/docker-compose.yml`** で、依存インストール・`next dev`・`next build` を実行する環境を定義する。ソースは **ボリュームマウント**し、ホストの Git で履歴管理する。`Dockerfile` では Docker CLI / pnpm / Supabase CLI もそろえる。 |
| **Node の版固定** | コンテナのベースイメージのタグ（例: **`node:24-bookworm`**）と **`.nvmrc` / `engines`** を揃え、後の CI（フェーズ4）と同じメジャーに寄せる。実際の **Active LTS** は時期で変わるため、[Node.js Releases](https://nodejs.org/en/about/releases) を都度確認する。 |
| **パッケージマネージャ** | **pnpm に固定**する。ロックファイルは **`pnpm-lock.yaml`** のみリポジトリに含める（`package-lock.json` / `yarn.lock` は作らない）。 |
| **Supabase CLI とローカル DB** | `supabase start` は裏で **追加の Docker コンテナ**を起動する。**CLI は開発コンテナ内で実行**し、`docker-compose.yml` の **`/var/run/docker.sock` マウント**経由でホスト Docker を操作する。`supabase/config.toml` で **Auth + REST + DB だけ**に絞り、不要なイメージ pull を抑える（フェーズ2 §4.2）。 |
| **エディタ** | TypeScript / ESLint / Prettier 用の拡張機能を Cursor / VS Code に入れておく。 |
| **`.gitignore`・Git 初期化・初回コミット** | **`git init` の前に**ルート **`/workspace/.gitignore`** を配置（`.env*` / `*.local` の安全網＋ルート固有の生成物。`web/` の依存・ビルド成果物は `web/.gitignore` 側）。その後 `git init`・`user.name`/`email`・`origin` を設定し、**`git add .`** で **最初のコミット**として push する（詳細は `phase2-local-dev-environment.md` §5）。 |

本手順書では、ホストに Node を入れず **コンテナだけ**で開発する運用に統一する。これにより「本番に近い Linux で動かす」体験と CI との揃えやすさの両方が得られる。

---

## フェーズ3：アプリの土台（まだ「機能の厚み」は後回しでよい）

**開発コンテナ内**（またはマウントしたリポジトリをコンテナが参照する形）で次を進める。

1. **`pnpm create next-app`** で **TypeScript + App Router** など、チュートリアルに近い構成（配置とコマンドは **`phase3-app-foundation.md`** に従い、**`web/`** で作成する）。
   - **Git の初期化・`origin` 設定はフェーズ2 §5 で済ませている**前提。`create-next-app` が `web/` 内に `.git` を作った場合は削除し、ルート `/workspace` の単一リポジトリに統一する。
   - 動作確認後、**アプリ一式**と **`todos` マイグレーション**をコミットして push する。
2. **`package.json` の `dev`** を `next dev -H 127.0.0.1`（必要なら `-p 3000`）にし、開発サーバーを **ループバックのみ**にバインドする（フェーズ2の方針）。
3. **`pnpm add @supabase/supabase-js`** でブラウザクライアントから接続（セッションはブラウザに保持。サーバー側 API は実装せず **Supabase の Auto-generated REST API** に任せる）。
4. Supabase 側に **最小スキーマ**（`todos` + `user_id` + **認証ユーザ向け RLS**）。
5. **ログイン / サインアップ**画面（メール / パスワード）でログインし、ブラウザクライアントでセッションを保持する。
6. **マイグレーション**を Supabase の `migrations` で管理し、変更は SQL ファイルに残す習慣を付ける。

---

## フェーズ4：自動テスト・品質ゲート

| タスク | 内容 |
|--------|------|
| **Lint** | ESLint CLI（例: `eslint .`）。※ Next.js 16 以降は `next lint` ではなく ESLint CLI を使う。 |
| **型チェック** | `tsc --noEmit`。 |
| **ユニットテスト** | **Vitest + React Testing Library** で「ToDo の1画面・小さな部品」から。 |
| **E2E（Playwright）** | **主要導線スモーク1本**（ログイン→追加→完了→削除→ログアウト）を用意する。**ローカルは任意手順**、**CI では PR 必須ゲート**にする。接続先は **`supabase start` で立てた DB**（手元のローカル / CI ランナー内。staging は別途用意しない）。 |
| **CI で実行** | `pnpm run lint` / `pnpm run typecheck` / `pnpm run test` を `quality` ジョブ、E2E スモークを `e2e` ジョブ（`needs: quality`）で GitHub Actions（**`ubuntu-latest`**）実行。**Node バージョンはフェーズ2の開発用コンテナ / `.nvmrc` と一致**させる。 |

「全部グリーンになるまでマージしない」をここで体験すると、CD の意味が掴みやすい。開発が Ubuntu + Docker なら、CI も Linux ジョブに寄せて差分を小さくできる。

---

## フェーズ5：CD（デプロイ）の線

| タスク | 内容 |
|--------|------|
| **Vercel 連携** | GitHub リポジトリを Import する。**`main` → Production**、**PR → Preview** がデフォルトで使える。 |
| **ビルド確認** | **開発用 Docker コンテナ内**（または CI と同じ Dockerfile を使うワンオフ実行）で **`next build`** が通ること。環境変数不足で落ちないか確認。 |
| **Supabase Auth URL** | Vercel の Production / Preview URL とローカル `http://127.0.0.1:3000` を Supabase の **Site URL** / **Redirect URLs** に登録する（**フェーズ5・5**。本番動作確認 **6** の前）。 |

---

> **CI（GitHub Actions）について**：CI ワークフロー（`ci.yml`）の作成とブランチ保護は **フェーズ4（CI の準備）** に含む。キャッシュ・バージョン固定・同時実行制御・夜間 E2E などの **CI の最適化（育てる）** は、実際に一周してから **フェーズ6 §11** で行う。

## フェーズ6：「修正してリリース」を一周する（ToDo に期限 `due_date` を追加）

**前提**: フェーズ5まで完了済み。ToDo アプリはタイトル・完了・削除のみで、期限フィールドはまだない。

**題材**: ToDo に **期限（`due_date`）** を追加する。DB 列は **NULL 許容の `date` 型**なので前方互換であり、安全にリリースの練習ができる。

**このフェーズのゴール**

- `todos` テーブルに `due_date` 列を **マイグレーション**で追加する
- 追加フォームと一覧で期限を **入力・編集**できる UI を実装する
- **ユニットテスト**と **E2E スモーク**に期限の検証を追加する
- PR で **CI**（`quality` → `e2e`）が通ることを確認する
- **Vercel Preview** で目視確認し、`main` マージ後に **Production**（Vercel / Supabase）へ反映する

### 作業の流れ

| ステップ | 内容 |
|----------|------|
| 1. ブランチ | `feat/todo-due-date` を切る。スキーマ + アプリ + テストを **1 つの PR** にまとめる |
| 2. マイグレーション | `due_date date` 列（NULL 許容）を追加。ローカルで `supabase db reset` して確認 |
| 3. 機能実装 + テスト | `page.tsx` / `TodoItem.tsx` に期限 UI。ユニット・E2E を更新 → **1 本目コミット** |
| 4. フォーム UI 改善 | ラベル・枠・ボタン配置を整える → **2 本目コミット** |
| 5. PR + CI | push して PR 作成。`quality` → `e2e` が緑になることを確認 |
| 6. Preview 確認 | `supabase db push` でクラウド DB に migration を適用 → Preview URL で目視確認 |
| 7. 本番反映 | PR を `main` にマージ → Vercel Production が更新される |
| 8. （任意）タグ | `v0.2.0` などでリリースを記録 |
| 9. （任意）CI 最適化 | キャッシュ・バージョン固定・`concurrency` など（§11） |

### 変更対象（概要）

| ファイル | 変更内容 |
|----------|----------|
| `supabase/migrations/` | `due_date` 列追加の SQL |
| `web/src/app/page.tsx` | 型・取得・追加フォーム・一覧での期限更新 |
| `web/src/components/TodoItem.tsx` | 各行に「期限:」付き日付入力 |
| `web/src/components/TodoItem.test.tsx` | 期限表示・変更のユニットテスト 3 本追加 |
| `web/e2e/todo.spec.ts` | 追加時の期限入力と一覧表示を E2E に組み込む |

### CI / CD で確認すること

- **CI `e2e`**: PR の migration を当てた DB に対して E2E が走り、**コードと migration の整合**を自動検証する（migration 漏れがあれば `column does not exist` で落ちる）
- **Preview**: Vercel が PR のコードをデプロイ。クラウド Supabase には **`supabase db push` を先に実行**しておく
- **Production**: `main` マージで Vercel が自動デプロイ。**DB を先に（expand）→ コードを後で**の順を守る

### コミット構成（2 本 / 1 PR）

1. `feat: add due_date to todos` — migration + 期限の追加・一覧編集 + テスト
2. `style: improve todo form layout and labels` — 追加フォームのラベル・枠・ボタン配置

各コミット前に `pnpm run dev` で目視確認 → `lint` / `typecheck` / `test` / `build` / `e2e` を実行する。

詳細手順・コード例・チェックリストは **`phase6-ship-a-change.md`** を参照。

---

## 推奨する作業順

1. GitHub リポジトリ作成
2. Vercel・Supabase のアカウントとプロジェクト
3. **Ubuntu + Docker**: **`.devcontainer`** 配下に開発用コンテナ（Node）の定義を置く。**Supabase CLI** は開発コンテナ内で実行し、`docker.sock` マウント経由で `supabase start` が動くようにする。**`git init` とリモート設定・初回コミット**もここで行う（フェーズ2 §5）
4. Next.js ひな形を **`web/`** に作成し、動作確認後にアプリ一式をコミットする
5. Next.js 最小 + Supabase Auth 接続 + `todos` テーブル（作業は **コンテナ内**が原則）
6. Lint / 型 / テスト + GitHub Actions（**Linux ジョブ**で Node 版を開発と揃える）。ユニット / E2E / `ci.yml` を区切りごとにコミット
7. Vercel への Import・環境変数・デプロイ（フェーズ5）
8. PR → Preview → マージ → 本番、を1回通す

---

各フェーズの詳細手順は `phase1` 〜 `phase6` の Markdown を順に参照する。
