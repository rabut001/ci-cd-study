# フェーズ2：Ubuntu + Docker 上の開発環境 — 具体手順

**前提（フェーズ1が完了していること）**

- GitHub に学習用リポジトリがある。
- Supabase の **Project URL** と **anon public キー**を、パスワードマネージャ等の安全な場所に控えている（Git には載せない）。

> **Docker / Docker Compose は事前セットアップ済みであることが前提**（本手順書の範囲外）。詳細はフェーズ1冒頭の「全フェーズ共通の前提」を参照。

**このフェーズのゴール**

- **Node / pnpm は開発用コンテナ内だけ**で使い、ソースはホストに置き **ボリュームマウント**でコンテナから読む。
- **Supabase のローカルスタック**を `supabase start` で起動できる（**Supabase CLI は開発用コンテナ内**に置き、**ホストの Docker デーモン**へ `docker.sock` をマウントして起動する）。
- **Node のメジャー**を `.nvmrc` や `engines`、`.devcontainer/Dockerfile` のベースタグで固定し、後の CI と揃えやすい状態にする。

**Node のバージョンについて**

手順中の **24** は、2026年5月時点で **Active LTS** である **Node 24** に合わせた例である。LTS の「いま推されているメジャー」は年とともに変わるので、作業前に [Node.js Releases](https://nodejs.org/en/about/releases) の **Active LTS** を見て、`.devcontainer/Dockerfile` / `.nvmrc` / `engines` / CI の `node-version` を **同じメジャー**に揃えればよい。

---

## 1. リポジトリと開発用コンテナの骨格

フェーズ3で Next.js を置く**前**に、まずディレクトリと Docker 定義を用意する。以降、リポジトリのルートを **`$REPO_ROOT`** と呼ぶ（例: `~/repos/ci-cd-study`）。

### 1.0 リポジトリ用ディレクトリを作る

ホスト側の任意の場所に、リポジトリのルートとなるディレクトリを作って移動する。以降のコマンドはここをカレントとして実行する。

```bash
# 例: ホームの repos 配下に作る場合（パスは好きな場所でよい）
mkdir -p ~/repos/ci-cd-study
cd ~/repos/ci-cd-study

# リポジトリ直下に .devcontainer と web を用意する
mkdir -p .devcontainer web
```

`web` はフェーズ3で Next.js アプリを作る配置先として先に用意しておく（`web/package.json` が置かれる前提）。

### 1.1 置くファイル

| ファイル | 役割 |
|----------|------|
| `.devcontainer/Dockerfile` | Node LTS イメージをベースに、Docker CLI、`git`、`pnpm`、Supabase CLI、開発に必要なその他のツールを入れる。（フェーズ4の E2E を開発コンテナで回すなら、Playwright/chromium の OS 依存もここで入れる） |
| `.devcontainer/docker-compose.yml` | サービス名（現状: `ci-cd-study`）、ビルドの `context`、ボリュームマウント、**ホストの `docker.sock` のマウント**、`network_mode: host` でホストのネットワークに直接バインドする。 |
| `.devcontainer/devcontainer.json` | **§1.6 で作成**。Cursor / VS Code の **Dev Containers** 用。 |
| `.dockerignore` | リポジトリルートに置く。`docker compose build` の**ビルドコンテキスト**（`context: ..`）から、巨大な生成物・秘密情報・`.git` を除外する（§1.4）。 |

ソースは **ホストの Git 管理のまま**、コンテナは **`$REPO_ROOT` を `/workspace` などにマウント**して作業する。

### 1.2 `.devcontainer/Dockerfile` の最小例（Node 24 / Active LTS 想定）

メジャーは [Releases](https://nodejs.org/en/about/releases) の Active LTS に合わせて変えてよい。**`FROM` のタグと `.nvmrc` を一致**させる。

```dockerfile
FROM node:24-bookworm-slim

WORKDIR /workspace

# git: このフェーズの git init / 以降の commit / clone など（node:-slim には含まれない）
# safe.directory: ボリュームマウントで所有者がずれると Git が dubious ownership で拒否するのを防ぐ
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    docker.io \
    git \
    && git config --global --add safe.directory /workspace \
    && rm -rf /var/lib/apt/lists/*

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9 --activate

RUN curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz \
    | tar -xz -C /usr/local/bin supabase supabase-go \
    && chmod +x /usr/local/bin/supabase /usr/local/bin/supabase-go

# Playwright (chromium) の実行に必要な OS ライブラリ（フェーズ4の E2E 用）。
# slim イメージには無く、入れないと chromium が libglib-2.0.so.0 不足などで起動できない。
# ブラウザ本体はバージョン結合のため、devcontainer.json の postCreateCommand で
# プロジェクトのピン版（@playwright/test に対応する版）を入れる。ここは OS 依存のみ。
RUN npx --yes playwright install-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# デフォルトは sleep 無限などではなく、compose の command で上書きする想定
CMD ["bash"]
```

- E2E をやらない段階では不要だが、**フェーズ4で E2E を回すと chromium の起動に OS ライブラリが要る**。CI（GitHub Actions）はジョブ内で `playwright install --with-deps` するため Dockerfile の変更は不要だが、**開発コンテナで E2E を回すなら**ここで OS 依存を入れておくと、コンテナに入ればすぐ動く。
- `playwright install-deps` は対象ブラウザに必要な apt パッケージ一覧を把握しているため、手で列挙するより保守が楽（OS 依存の一覧はバージョン間で安定しているので未ピンで可）。

### 1.3 `.devcontainer/docker-compose.yml` の最小例

```yaml
services:
  ci-cd-study:
    build:
      context: ..
      dockerfile: .devcontainer/Dockerfile
    working_dir: /workspace
    volumes:
      - ..:/workspace
      - /var/run/docker.sock:/var/run/docker.sock
    network_mode: host
    environment:
      - NODE_ENV=development
    stdin_open: true
    tty: true
    command: sleep infinity
```

- **`network_mode: host`**: `ports` の publish を使わず、コンテナ内のプロセスが **ホストと同一のネットワーク名前空間**で動く（Docker Engine on **Linux**）。開発サーバーは **必ず `127.0.0.1` のみ** にバインドし、`0.0.0.0`（全インターフェース）にはバインドしない。同一端末のブラウザから **`http://127.0.0.1:3000`**（ポートはプロジェクトに合わせる）でアクセスする。
- **`sleep infinity`**: コンテナを常時起動したまま待機する。以降の作業（§2 以降）は **§1.6 の Dev Container 接続後、IDE のターミナル**から行う。§1.5 の `exec` は初回ビルド確認用。慣れたら `command` を `pnpm run dev` に変えてもよい（その場合も **`dev` スクリプトはループバックのみ**にすること）。
- **環境変数**: `env_file` に `../.env.local` を指定する、など（`.env.local` は **Git にコミットしない**）。

### 1.4 リポジトリルートの `.dockerignore` の例

**1.3** の `build.context: ..` により、`docker compose build` ではリポジトリルートがビルドコンテキストとして Docker に送られる。現状の **Dockerfile は `COPY` しない**が、コンテキストが大きいと **ビルドが遅く・重く**なる。本手順書の流れで**実際に大きくなる／秘密になり得るもの**だけ除外する（`.gitignore` とは目的が別）。

```dockerignore
# Git
.git

# 秘密情報（§5.1 と同系）
.env
.env.*
*.local

# Node / Next.js（フェーズ3以降。web/ 配下）
**/node_modules
**/.next
**/out

# pnpm（§5.1）
.pnpm-store

# Supabase ローカル（§4。config.toml / migrations は除外しない）
supabase/.temp
supabase/.branches

# Playwright（フェーズ4。web/ 配下）
**/test-results
**/playwright-report
**/blob-report

# エディタ・OS
.cursor
.DS_Store
```

### 1.5 起動とコンテナ内シェル（初回ビルド確認）

§1.6 で Dev Container に接続する**前**に、ホスト側でイメージのビルドと起動確認を行う。**§1.6 以降の作業は IDE のターミナル**から行う（`exec` はここだけ）。

```bash
cd "$REPO_ROOT"
docker compose -f .devcontainer/docker-compose.yml build
docker compose -f .devcontainer/docker-compose.yml up -d
docker compose -f .devcontainer/docker-compose.yml exec ci-cd-study bash
```

コンテナ内で `node -v` が `.devcontainer/Dockerfile` のメジャーと一致することを確認する。あわせて **`git --version`**、`pnpm -v`、`docker ps`、`supabase --version` が動くことを確認する（`docker.sock` の権限で失敗する場合は、ホスト側の `docker` グループと UID/GID の扱いを調整する）。`Dockerfile` 変更後は古いイメージを避けるため、`docker compose -f .devcontainer/docker-compose.yml build --no-cache` で再ビルドする。

作業が終わったら、ホスト側で次で止める。

```bash
cd "$REPO_ROOT"
docker compose -f .devcontainer/docker-compose.yml down
```

### 1.6 `.devcontainer/devcontainer.json` を作成する

`.devcontainer/devcontainer.json` を新規作成し、次を書く。

```json
{
  "name": "ci-cd-study",
  "dockerComposeFile": "docker-compose.yml",
  "service": "ci-cd-study",
  "workspaceFolder": "/workspace",
  "postCreateCommand": "bash -lc 'if [ -f web/package.json ]; then cd web && pnpm install && pnpm exec playwright install chromium; fi'",
  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode"
      ],
      "settings": {
        "remote.autoForwardPorts": false,
        "remote.restoreForwardedPorts": false
      }
    }
  }
}
```

#### IDE から Dev Container に接続する

1. **`$REPO_ROOT` をフォルダとして開く**。
2. §1.5 で `compose up` 済みなら、先に `compose down` する。
3. コマンドパレット（`Ctrl+Shift+P`）→ **`Dev Containers: Reopen in Container`** を実行する。
4. ビルドと起動が終わるまで待つ（初回は数分かかることがある）。
5. 左下に Dev Container の接続表示が出れば完了。ターミナルは **`/workspace`** で開く。

---

## 2. Node バージョンの固定（CI と揃えるため）

### 2.1 `.nvmrc`

Node プロジェクトのルートである **`web/.nvmrc`** に置く（`cd web` 直下で `nvm use` しやすく、実際の `package.json` 配置と一致する）。

```text
24
```

### 2.2 `.devcontainer/Dockerfile` の `FROM` と一致させる

`FROM node:24-...` と `web/.nvmrc` の `24`、GitHub Actions の `node-version: '24'` を揃える。フェーズ4で CI を書くときにここを参照する。

---

## 3. pnpm に固定する

本リポジトリのパッケージマネージャは **pnpm のみ**とする。

- `corepack enable` と `corepack prepare pnpm@9 --activate` は **1.2 の `Dockerfile`** で実施済みのため、このフェーズでは再実行しない。
- 確認は最小限として、**§1.6 で Dev Container に接続した IDE のターミナル**で `pnpm -v` が表示されることだけを見る。

---

## 4. Supabase CLI とローカル DB

`supabase start` は、Docker 上で Postgres など**別コンテナ群**を立ち上げる。**1.2 の `Dockerfile`** に Docker CLI と Supabase CLI を入れ、**1.3 の `volumes`** でホストの **`/var/run/docker.sock`** をマウントしたうえで、**§1.6 で Dev Container に接続した IDE のターミナル**から `supabase` を実行する。

### 4.1 リポジトリで `supabase init`

**§1.6 で Dev Container に接続した IDE のターミナル**で次を実行する。

```bash
cd /workspace
supabase init
```

`supabase/config.toml` などが生成される。

### 4.2 `config.toml` で必要なサービスだけに絞る

`supabase init` のデフォルトは Studio / Storage / Realtime など**フルスタック**向けで、`supabase start` 時に多数の Docker イメージを pull する。本リポジトリ（ToDo アプリ）が使うのは **Postgres（DB）・Auth・REST API（PostgREST）** だけなので、不要なサービスは **`supabase/config.toml` で `enabled = false`** にしておく（`config.toml` は Git に含める）。

| 無効化する設定 | 理由 |
|----------------|------|
| `[storage]` | ファイルアップロードを使わない |
| `[realtime]` | リアルタイム購読を使わない |
| `[edge_runtime]` | Edge Functions を使わない |
| `[studio]` | ダッシュボード UI は開発に必須ではない |
| `[analytics]` | ログ分析を使わない |
| `[inbucket]` | メール確認オフ（`[auth.email] enable_confirmations = false`）なら不要 |

`config.toml` で無効化すると、CLI は**そのサービスの Docker イメージ自体を pull しない**（`supabase start -x ...` だけだとイメージ取得が残る場合がある）。

生成された **`supabase/config.toml`** の該当セクションを次のように変更する（他の設定はそのままでよい）。

```toml
[realtime]
enabled = false

[studio]
enabled = false

[inbucket]
enabled = false

[storage]
enabled = false

[edge_runtime]
enabled = false

[analytics]
enabled = false
```

変更後は **`supabase stop` → `supabase start`** で反映する。起動後、`docker ps` で Supabase 関連コンテナが **`db` / `kong` / `auth` / `rest` の 4 つ程度**になっていればよい（デフォルトのフルスタックでは 10 以上になる）。

> 将来 Storage や Realtime を使う機能を足すときは、該当セクションを `enabled = true` に戻す。

### 4.3 ローカル起動・停止

**§1.6 で Dev Container に接続した IDE のターミナル**で次を実行する。

```bash
supabase start
# 完了後に表示される API URL / anon key はローカル専用。控えて .env.local 等に使う
supabase status
supabase stop
```

### 4.4 クラウドの Supabase とのリンク（任意）

フェーズ3以降でマイグレーションをリモートに当てるときに使う。**§1.6 で Dev Container に接続した IDE のターミナル**で実行する。

```bash
supabase login
supabase link --project-ref <Reference ID>
```

**Database パスワード・service_role は Git に含めない。**

---

## 5. ルート `.gitignore` の配置と Git の初期化・最初のコミット

ここまでで「開発コンテナ＋ローカル Supabase」の土台ができたので、**この時点で Git を初期化し、最初のコミット**を作る（以降のフェーズは、この上に積んでいく）。作業は **§1.6 で Dev Container に接続した IDE のターミナル**、カレントは **`/workspace`**。

> **重要**：`git init` の **前に**、まずルートの **`/workspace/.gitignore`** を置く。これを最初に置くことで、`.env.local` や Supabase の鍵などが **一度も Git に追跡されない**状態を保証する（追跡され始めてから `.gitignore` に足しても、履歴からは消えない）。

### 5.1 ルート `.gitignore` を最初に置く（`git init` より前）

エディタで **`/workspace/.gitignore`** を作成する。ルートには **2 種類だけ**書く。

1. **秘密情報の安全網**（`.env*` / `*.local`）… `web/.gitignore` ができる前（＝`git init` 時点）に確実に除外したいので、**意図的に重複させて**でもルートへ置く。
2. **`web/` の外に出る生成物**（`.pnpm-store/`、`.cursor/`、`supabase/.temp/` など）。

`web/` の依存・ビルド成果物（`node_modules` / `.next` / `out` / `coverage` / `next-env.d.ts` など）や Playwright 出力は **`web/` 配下にしか出ない**ので、**フェーズ3で `create-next-app` が生成する `web/.gitignore`（§2）と、フェーズ4 §5.4** に任せ、ルートには重複して書かない。

```gitignore
# ============================================================
# 環境変数・秘密情報（最優先。git init より前にここへ置く安全網）
# web/.gitignore とは意図的に重複させ、追跡が始まる前に確実に除外する
# ============================================================
.env
.env.*
*.local

# ============================================================
# web/ の外（ルート直下など）に現れるツール生成物
# ============================================================
.pnpm-store/
.cursor/
.DS_Store

# ============================================================
# Supabase のローカル生成物（config.toml と migrations は追跡する）
# ============================================================
supabase/.temp/
supabase/.branches/
```

- **`.env*` / `*.local`** は、先頭に `/` を付けない（＝どの階層でも一致する）ことで、`web/.env.local`（§5.3 で空ファイルを置き、フェーズ3で値を入れる）も含めて除外される。
- **追跡したいもの**（`supabase/config.toml`、`supabase/migrations/`、`.devcontainer/`、`web/.nvmrc` など）は除外対象に入れない。
- **`.pnpm-store/`**: pnpm のストアが `/workspace/.pnpm-store` のようにルート直下に作られる構成のときに効く（`web/.gitignore` には無いため、ルートで押さえる）。

### 5.2 初期化とリモート設定（`.git` がまだ無い場合のみ）

```bash
cd /workspace
git init
# 初回コミット前に実行者情報を設定（未設定の場合）
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
# マウントで所有者がずれて「detected dubious ownership」になるときの保険
# （1.2 の Dockerfile で設定済みなら不要。エラー時のみ）
git config --global --add safe.directory /workspace
git branch -M main
git remote add origin <your-github-repo-url>
```

- 既に `.git` がある（フェーズ1で作成済み・GitHub からクローン済みなど）なら `git init` と `git remote add` は不要。`git remote -v` で確認する。
- `<your-github-repo-url>` はフェーズ1で作った学習用リポジトリの URL。

### 5.3 最初のコミットと push

**5.1 の `.gitignore` を先に置いたうえで**、追跡対象を **鍵類を含めずに**コミットする。フェーズ3 まで `.env.local` はまだ中身を書かないが、**空ファイルを先に作って** `.gitignore` が効いているか確認してから `git add` する（設定ミスがあると `git status` に `.env.local` が現れる）。

```bash
cd /workspace
# .gitignore の動作確認用（中身は空でよい。フェーズ3で Supabase の値を入れる）
touch web/.env.local
git add .
git status   # web/.env.local が Untracked / staged に出てこないこと（重要）
git commit -m "chore: add gitignore, dev container & supabase local config"
git push -u origin main
```

- **`web/.env.local` が `git status` に出たら** `.gitignore` の `.env*` / `*.local` を見直し、修正してからコミットする（出なければ除外できている）。
- あわせて **`memo.local`** や **`supabase/.temp/`** 等もステージに含まれていないことを確認する。
- リモートが空でも `git push -u origin main` で初回 push できる。以降のフェーズは「区切りごとにコミット → push」を基本にする。

---

## フェーズ2の完了チェックリスト

- [ ] リポジトリに **`.devcontainer/Dockerfile`**、**`docker-compose.yml`**、**`devcontainer.json`**、ルート **`.dockerignore`** がある。**§1.6** の Dev Containers で接続でき、IDE のターミナルが **`/workspace`** で開く。
- [ ] IDE のターミナルで **`node -v`** が意図した LTS メジャーである。
- [ ] **`web/.nvmrc`** を置き（またはフェーズ3直後に置くメモ）、IDE のターミナルで **`pnpm -v`** が動く。
- [ ] IDE のターミナルで **`git --version`** が動く（**`Dockerfile`** の `apt` で `git` を入れている）。
- [ ] IDE のターミナルで **Supabase CLI** が動き、`docker.sock` 経由でホストの Docker 上にローカルスタックが立ち、`supabase init`・**§4.2 の最小構成 `config.toml`**・`supabase start` / `stop` を試した。
- [ ] **`git init` の前にルート `/workspace/.gitignore`** を配置し、`.env*` / `*.local`（秘密情報の安全網）とルート固有の生成物を除外した（**5.1**。`web/` の依存・ビルド成果物は `web/.gitignore` 側）。
- [ ] **`git init`（または既存 `.git` の確認）と `origin` 設定**を行い、空の **`web/.env.local`** を置いたうえで **`git add .`** → **`git status`** で `.env.local` が出ないことを確認し、初回コミットして `main` に push した（**5.2 / 5.3**）。

次は **フェーズ3（Next.js の土台 + Supabase 接続 + `todos` スキーマとマイグレーション）** に進む。作業コマンドは原則 **§1.6 で Dev Container に接続した IDE のターミナル**で実行する。
