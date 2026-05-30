# フェーズ5：CD（デプロイ）— Vercel 本番 / プレビュー — 具体手順

**前提（フェーズ4まで完了していること）**

- `web/` に Next.js アプリがあり、ローカルで `pnpm run lint` / `typecheck` / `test` / `build` が通る。
- （推奨）`.github/workflows/ci.yml` があり、`main` への push と PR で品質ゲートが走る。
- （推奨）フェーズ4 §7 でブランチ保護を有効化済み。以降の変更は PR 経由（`main` への直接 push 不可）。
- フェーズ1で **Vercel アカウント**と **GitHub 連携**（リポジトリへのアクセス許可）まで済んでいる。
- フェーズ1で Supabase クラウドプロジェクトを作り、**Project URL** と **anon public キー**を控えている。
- フェーズ3で `supabase/migrations` に `todos` 用 SQL がある（ローカルで `supabase db reset` 済みが望ましい）。

**レイアウトの前提**

- Git の管理対象はリポジトリルート **`/workspace`**。
- Next.js アプリは **`/workspace/web`** にある（Vercel の **Root Directory** は `web`）。
- Supabase の設定・マイグレーションはルートの **`/workspace/supabase`** にある。

**このフェーズのゴール**

- GitHub リポジトリを Vercel に Import し、**`main` → Production**、**PR → Preview** で自動デプロイできる。
- 本番・プレビュー双方で `next build` が通り、環境変数不足で落ちない。
- クラウド Supabase に `todos` スキーマが載り、Supabase Auth の **Redirect URLs** が Vercel URL と一致している。
- ログイン済みユーザがデプロイ先 URL から `todos` にアクセスできる。

---

## 1. デプロイ前のローカル確認（開発コンテナ内）

Vercel に繋ぐ前に、**CI と同じ順**でローカルを通しておく。作業は **開発コンテナ内**、コマンドは **`web/`** で実行する。

```bash
cd /workspace/web
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```

### 1.1 ビルド時の環境変数

`NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` は **ビルド時にも** Next.js が参照する。

| 使う場所 | 入れる値 |
|----------|----------|
| **`web/.env.local`**（ローカル開発・E2E） | `http://127.0.0.1:54321` と手元 `supabase status` の Publishable key（フェーズ3 §6） |
| **GitHub Secret / Vercel 環境変数**（CI Build・デプロイ） | **クラウド Supabase**の Project URL / anon public キー（**1.2** / **3.3**） |

本番ビルドの挙動を先に確かめる場合、一時的に次のように **クラウドの値**で `build` だけ通すこともできる（値はフェーズ1で控えたもの）。

```bash
cd /workspace/web
export NEXT_PUBLIC_SUPABASE_URL="https://<your-project-ref>.supabase.co"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="<your-anon-public-key>"
pnpm run build
```

- ここで `Supabase environment variables are not set` などが出る場合、Vercel 側の環境変数未設定と同種の失敗になる。**フェーズ5の 3.3** で Vercel に変数を入れるか、上記 export でローカル build を通してから進む。

### 1.2 GitHub Secret とリモート `main` の確認

Vercel の Import は **GitHub 上の `main` の最新コミット**を参照する。フェーズ4 §7 済みのため **`main` への直接 push は不可**（`GH013`）。Secret 登録と `ci.yml` の修正は、必要なら **PR で `main` にマージ**する。

#### Secret を登録する

フェーズ4の CI は最後に `pnpm run build` を実行する。`web/.env.local` は Git に載らないため、**GitHub 側に同じ値を渡さないと Build ステップだけ exit code 1** になる（`Supabase environment variables are not set` など）。

1. GitHub リポジトリ → **Settings** → **Secrets and variables** → **Actions**。
2. **New repository secret** で、**クラウド Supabase**（Supabase ダッシュボード → **Project Settings** → **API**。フェーズ1で控えた Project URL / **anon public** キー）を次の名前で登録する。

| Name | Value |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL（`https://<ref>.supabase.co` まで。`/rest/v1/` 等のパスは付けない） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **anon public** キー |

- `anon` キーは公開前提だが、**リポジトリにコミットしない**運用のため Secret でよい。
- ログに **Node.js 20 actions are deprecated** と出るだけのときは警告。Build 失敗の主因は環境変数未設定のことが多い。
- **§6.2 で `ci.yml` を push する前**（または PR をマージする前）に登録しておくと、初回 CI の **Build** が通りやすい。

#### `ci.yml` の Build ステップを確認する

`.github/workflows/ci.yml` を開き、`quality` ジョブの **Build** ステップを確認する。

- 既にフェーズ4 §6 と同じ **`env:`**（下記）がある → 修正不要。
- 無い、または Secret 名が違う → 下記に合わせて**修正**し、続く「リモートへ反映する」で PR に載せる。

```yaml
      - name: Build
        run: pnpm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
```

#### `main` の状態を確認する

開発コンテナ内（`origin` 未設定はフェーズ2 §5 の `git remote add origin <url>`）。PR 用ブランチを切る前に `main` を最新にしておく。

```bash
cd /workspace
git switch main
git pull origin main
git status    # 未コミットの変更（ci.yml 修正など）、origin/main より進んでいないか
```

- **`git status` が clean** で **`Your branch is up to date with 'origin/main'.`**（`ahead of 'origin/main'` が無い）→ push / PR は**不要**。Actions の CI（とくに **Build**）が緑なら **2.**（Vercel）へ。
- **変更ファイルがある**、または **`ahead of 'origin/main'`** と出る → 次のとおり PR 経由で反映する（`main` 上で commit してから push しない）。

```bash
git switch -c chore/ci-supabase-env   # 上記 pull 済みの main から
# ci.yml を修正したら:
git add .github/workflows/ci.yml
git status                   # web/.env.local がステージされていないこと
git commit -m "ci: pass Supabase secrets to build step"

git push -u origin chore/ci-supabase-env
```

1. GitHub で **Pull request** を作成（base: `main`、compare: `chore/ci-supabase-env`）。
2. **Checks** で `quality` と `e2e` が緑になるまで待つ（Secret 未登録なら上で登録して PR に再 push）。
3. PR を **Merge** する。

- `web/.env.local` はコミットしない（`.gitignore` で除外されている想定）。
- リモート `main` が最新で CI が緑になっていることを確認してから **2.** 以降の Vercel 登録に進む。

---

## 2. クラウド Supabase にスキーマを載せる

ローカルで試したマイグレーションを、**本番（クラウド）プロジェクト**にも適用する。作業は **開発コンテナ内**、カレントは **`/workspace`**（`supabase/` があるルート）。

### 2.1 リンク（未実施の場合）

```bash
cd /workspace
supabase login
supabase link --project-ref <Reference ID>
```

- **Reference ID** はクラウドの Supabase プロジェクト1件を指す ID（**Project Settings** → **General**）。API URL の `https://<Reference ID>.supabase.co` のサブドメイン部分と同じ。フェーズ2で `supabase link` 済みなら **2.1 は省略**して **2.2** へ。
- パスワード入力を求められたら、プロジェクト作成時に保存した **Database Password** を使う。

### 2.2 マイグレーションの反映

```bash
cd /workspace
supabase db push
```

- 初回は `supabase/migrations/` 内の SQL がリモートに適用される。
- ダッシュボードの **Table Editor** で `todos` テーブルが見えれば成功。

> 代替: 学習用にダッシュボードの **SQL Editor** へ `supabase/migrations/..._create_todos_table.sql` の内容を貼って実行してもよい。以降は **CLI + マイグレーションファイル**に揃えるとフェーズ6の変更フローと一致する。

### 2.3 本番データの接続先

デプロイ後のアプリは **クラウド**の Project URL / anon key を読む。ローカル `supabase start` の URL は本番では使わない。Vercel の環境変数（**3.3**）に **クラウド**の値を入れる。

---

## 3. Vercel プロジェクトの登録（Import）

GitHub リポジトリを Vercel に Import し、Project を作成する。

### 3.1 Import 〜 New Project の設定画面

リポジトリを選ぶと、**同じ画面**でビルド設定・環境変数を入れ、最後に **Deploy** で Project 作成と初回デプロイが始まる（この画面に **Save** ボタンは無い）。

1. [Vercel Dashboard](https://vercel.com/dashboard) → **Add New…** → **Project**。
2. **Import Git Repository** で、**1.2** で `main` が最新になっている学習用リポジトリを選ぶ（一覧に無い場合は **Adjust GitHub App Permissions** でリポジトリを追加）。
3. フレームワークは **Next.js** と検出されればそのまま進む。
4. 下記 **3.2** のビルド設定と **3.3** の環境変数を済ませる。
5. 画面下部の **Deploy** を押す（表示が **Deployment** に近い表記でも、初回デプロイを開始するボタンとして扱う）。失敗したら **3.4**。

### 3.2 モノレポ設定（重要）

New Project 画面の **Configure Project** で、リポジトリルートの `web/` を指定する。

| 項目 | 値 |
|------|-----|
| **Root Directory** | `web`（**Edit** で `web` を指定） |
| **Framework Preset** | Next.js |
| **Build Command** | 既定の `pnpm run build` または `next build` |
| **Install Command** | 既定の `pnpm install`（`web/pnpm-lock.yaml` があること） |
| **Output Directory** | 既定（Next.js は通常変更不要） |

### 3.3 環境変数（Deploy の前）

同じ New Project 画面の **Environment Variables**（または **Add**）で、**Deploy を押す前**に次を入れる。

> **入れる値はクラウド Supabase（本番プロジェクト）**
>
> - **Production / Preview 用**：フェーズ1で控えた **Supabase ダッシュボード**の Project URL / **anon public** キー（`1.2` の GitHub Secret と**同じクラウドの値**でよい）。
> - **ローカル開発用ではない**：`http://127.0.0.1:54321` や手元 `supabase start` のキーは **`web/.env.local` のみ**に置く。Vercel にローカル値を入れると、デプロイ先から Supabase に接続できない。

| Key | Value（クラウド Supabase） | 適用先 |
|-----|--------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | ダッシュボードの Project URL（`/rest/v1/` は付けない） | **Production** と **Preview** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **anon public** キー | **Production** と **Preview** |

- **service_role** は入れない。Database の接続 URI も不要。

### 3.4 デプロイに失敗した場合

**Deployments** で失敗した行を開き、**Building** のログを末尾まで確認する。直したあとは **Deployments** → 対象の **⋯** → **Redeploy**（環境変数を変えたときは **Settings** → **Environment Variables** で **Save** してから Redeploy）。

| ログ・症状 | 対処 |
|------------|------|
| `Supabase environment variables are not set` | **3.3** の `NEXT_PUBLIC_*` が未設定、または **Production** / **Preview** に付いていない。設定後 **Redeploy**。 |
| `No such file` / `package.json` が見つからない | **Root Directory** が `web` になっているか（**3.2**）。**Settings** → **General** で修正して **Redeploy**。 |
| `pnpm: command not found` / インストール失敗 | **Settings** → **General** の **Install Command** を `corepack enable && corepack prepare pnpm@9 --activate && pnpm install` に変更して **Redeploy**（必要なときだけ）。 |
| Node の不一致などビルドエラー | Import 画面に **Node.js Version** が無いことが多い。**Settings** → **General** で **24.x** など（フェーズ2と同メジャー）に合わせて **Redeploy**。 |
| 原因が分からない | ローカルと GitHub Actions で `pnpm run build` が通るか先に確認（**1.** / **1.2**）。通るのに Vercel だけ失敗なら、上記の設定差分を疑う。 |

---

## 4. デプロイ結果の確認とブランチ運用

1. **Deploy** が **Ready** になること（失敗時は **3.4**）。**Production URL**（例: `https://<project>.vercel.app`）を開く。
2. 環境変数を Import 後に足した・直した場合は **Settings** → **Environment Variables** で編集し **Save** のあと **Deployments** → **Redeploy** する（**Save** は Project 作成後の Settings にある）。

以降、`main` への push / マージで **Production**、PR で **Preview** が自動デプロイされる。

### 4.1 ブランチと環境の対応（デフォルト運用）

| Git の動き | Vercel の環境 | URL の例 |
|------------|---------------|----------|
| `main` へ push / マージ | **Production** | `https://<project>.vercel.app` |
| PR 作成・更新 | **Preview** | `https://<branch>-<hash>.vercel.app` など |

追加の GitHub Actions でデプロイする必要はない（**Git 連携が CD**）。CLI デプロイ（`VERCEL_TOKEN`）は発展課題。

---

## 5. 本番動作の確認

1. **8.** の URL 設定を済ませたうえで Production URL を開く。
2. 未ログインで `/` を開くと `/login` にリダイレクトされる。`/login` でサインアップ → ログインすると `/` に遷移し、見出し **ToDo**・追加フォーム・ログアウトボタンが表示されること。
3. ToDo が 0 件でも画面（見出し・フォーム）が出れば Auth + RLS + 接続は成功。フォームから 1 件追加して一覧に並び、完了チェックや削除が効くか確認する。

### 5.1 よくある本番だけの失敗

| 症状 | 確認すること |
|------|----------------|
| ビルド失敗「environment variables are not set」（デプロイ時） | **3.4** を参照。 |
| 実行時 `Invalid API key` | anon キーのコピーミス、別プロジェクトの URL/キーを混在していないか。 |
| サインアップ後にログインできない（`Email not confirmed`） | 本番はメール確認が ON（**8.** の注記）。確認メールのリンクを開くか、ダッシュボードで Confirm email をオフにする。 |
| `permission denied` / RLS エラー（`/` が空のまま等） | 未ログイン、またはクラウド DB に `todos` の **RLS ポリシー（フェーズ3の migration）** が未適用。ログイン後も失敗なら **2.** を確認。 |
| ログイン後も `/login` に戻される | Auth セッションが張れていない。**8.** の Redirect URLs に Production URL があるか、anon キー / URL が正しいか確認。 |
| テーブルなし（`relation "todos" does not exist`） | `supabase db push` 未実行。ダッシュボードで `todos` の有無を確認。 |

---

## 6. Preview デプロイの確認（PR フロー）

CI/CD の「プレビューで確認」を一度体験する。変更内容は **`web/src/app/page.tsx` の見出しを `ToDo` → `ToDo一覧` に変更**する（Preview と本番の差が目視しやすい、最小の可視変更）。

### 6.1 ブランチを切る（開発コンテナ内）

```bash
cd /workspace
git checkout main
git pull origin main    # リモート main が進んでいる場合
git checkout -b chore/preview-check
```

### 6.2 `page.tsx` を編集して push する

**`web/src/app/page.tsx`** の `<header>` 内の見出しテキストだけを **`ToDo` → `ToDo一覧`** に変更する（フェーズ3 §10 で付けた Tailwind の `className` はそのまま）。

```tsx
        <h1 className="text-2xl font-semibold">ToDo一覧</h1>
```

- 変更前は `<h1 className="text-2xl font-semibold">ToDo</h1>`。ロジックや他の要素（追加フォーム・一覧・ログアウト）は触らない。
- E2E スモークの見出しチェックは部分一致（`name: "ToDo"`）なので、`ToDo一覧` でもそのまま通る。

コミットしてリモートへ push する。

```bash
cd /workspace
git add web/src/app/page.tsx
git commit -m "feat: 見出しを ToDo一覧 に変更"
git push -u origin chore/preview-check
```

### 6.3 PR と Preview URL で確認する

1. GitHub で **Compare & pull request**（または **New pull request**）→ base: `main`、compare: `chore/preview-check` で PR を作成する。
2. PR の **Checks** で CI が緑になるのを待つ（赤なら **1.2** / **3.4** を参照）。
3. PR 画面の Vercel コメント、または Vercel **Deployments** の **Preview** 行から Preview URL を開く。
4. Preview URL で `/login` → ログイン後、画面の見出しが **ToDo一覧** になっていれば Preview 成功（**8.** の Preview 用 Redirect URL を確認）。
5. マージせず PR を閉じてもよい（学習のみ）。本番へ載せる場合は **7.** へ。

Preview でも **同じ Supabase プロジェクト**を指すことが多い（**3.3** で Preview にも環境変数を付けたため）。本番 DB を共有するので、テスト用の `insert` など破壊的な操作は控える。

> **マイグレーションを伴う変更と Preview の注意**
>
> `NEXT_PUBLIC_*` は**ビルド時に焼き込まれ**、Preview デプロイは **Preview スコープの環境変数で決まった 1 つの Supabase** を見る（アクセス元の URL で接続先が動的に変わるわけではない）。標準構成では**全 Preview が同じ Supabase を共有**するため、**列追加などスキーマ変更を含む PR**では「Preview のコードは新スキーマ前提だが、共有 DB にはまだ migration が当たっていない」状態になり、その Preview が落ちることがある。
>
> - **PR マージ前の自動ゲートとしてのスキーマ検証**は、Preview ではなく **フェーズ4の `e2e` ジョブ**（CI ランナー内で `supabase start` し、PR の migration を当てた DB で E2E）で担保する（こちらはコードとスキーマが常に一致する）。
> - Preview URL 自体を**「その PR 専用の migration 済み DB」**に向けたい場合は、**Supabase Branching（PR ごとに使い捨ての Supabase インスタンスを Supabase 側に作成）** が必要。これは **Pro プラン以上の有料機能**（ブランチの稼働時間で従量課金）で、学習用の無料運用では必須ではない。
> - 当面は「**スキーマ検証は CI の `e2e`、Preview は UI 目視確認**」と役割を分けると、無料のまま安全に回せる。

---

## 7. `main` マージで Production を更新する

1. PR を **Merge** する。
2. Vercel が自動で Production デプロイを開始する。
3. **Deployments** で **Production** が **Ready** になるまで待つ。
4. Production URL を再度開き、期待どおり表示されることを確認する。

ここまでで README のフェーズ0にある「**`main` にマージすると本番が更新される**」「**PR ではプレビューが出る**」の CD 部分が一通りできる。

---

## 8. Supabase Auth の URL 設定（必須）

本アプリは**メールアドレス + パスワード認証**を使う。本番（クラウド）の Supabase は**メール確認（Confirm email）がデフォルトで有効**なため、サインアップ時に**確認メール内のリンク**が送られ、そのリンクの遷移先として Site URL / Redirect URLs を使う。Vercel とローカルの URL を Supabase に登録する。**Import 後、初回デプロイが成功して Production URL が分かってから**行う。

1. Vercel **Deployments** の **Production** URL を控える（例: `https://<project>.vercel.app`）。
2. Supabase ダッシュボード → **Authentication** → **URL Configuration**。
3. 次を設定する。

| 項目 | 値（例） |
|------|----------|
| **Site URL** | Production URL（`https://<project>.vercel.app`） |
| **Redirect URLs** | 下記を **1 行ずつ**追加 |

**Redirect URLs に追加する行（学習用の最小セット）:**

```
http://127.0.0.1:3000/**
http://localhost:3000/**
https://<project>.vercel.app/**
https://*-<project>.vercel.app/**
```

- `<project>` は Vercel のプロジェクト名（Production ホスト名のサブドメイン部分）。
- 3 行目は **Production**、4 行目は **PR Preview**（`https://<branch>-<hash>.vercel.app` 形式）向けのワイルドカード。
- Preview のホスト名が異なる場合は、失敗した Preview URL を **Redirect URLs** に追記して **Save** する。

4. **Save** 後、Production / Preview の両方で **サインアップ → ログイン → ToDo 画面（見出し・追加フォーム）** が表示されることを確認する。未ログインで `/` を開くと `/login` にリダイレクトされるのは想定どおり。

> **ローカルと本番でサインアップ挙動が違う点に注意**
>
> - **ローカル**（`supabase start`）は `config.toml` で**メール確認をオフ**にしているため、サインアップ直後にそのままログインできる（E2E もこれを前提）。
> - **本番（クラウド）**は**メール確認がデフォルト ON**。サインアップ後に届く確認メールのリンクを開くまで、`signInWithPassword` は `Email not confirmed` で失敗する。本番で「サインアップしたのにログインできない」場合はメール確認待ちを疑う。
> - 学習用に本番でも即ログインしたいときは、Supabase ダッシュボード → **Authentication** → **Sign In / Providers**（Email）で **Confirm email** をオフにできる（公開アプリでは推奨しない）。確認メールのリンク遷移先には、上記 **Redirect URLs** が使われる。

---

## 9. （任意）`vercel.json` でビルドを明示する

通常は **Root Directory = `web`** だけで十分。チームで設定を固定したいとき、**`web/vercel.json`** に最小例を置ける。

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm run build"
}
```

- ルート（`/workspace/vercel.json`）ではなく **`web/vercel.json`** に置く（Root Directory が `web` のため）。
- 変更後は Vercel が次回デプロイで読み込む。

---

## 10. （任意）カスタムドメイン

1. Vercel Project → **Settings** → **Domains**。
2. 所有ドメインを追加し、表示される DNS レコードをレジストラに設定する。
3. 証明書が **Valid** になったら、その URL でもアプリと Supabase 接続を確認する。

学習の初期段階では `*.vercel.app` のままでよい。

---

## 11. このフェーズとフェーズ4 / 6 の関係

| フェーズ | 役割 |
|--------|------|
| **フェーズ4** | Lint / 型 / テスト + GitHub Actions（**マージ前の品質ゲート = CI**。`ci.yml` とブランチ保護を含む） |
| **フェーズ5（本書）** | Vercel による **配信 = CD**（`main` / PR に応じたデプロイ） |
| **フェーズ6** | ブランチ → PR → Preview → マージ → 本番 の **一連の実演**（ToDo に期限を追加）＋ **CI の最適化**（§10） |

フェーズ4で CI を入れていれば、**CI が緑 → マージ → Vercel が本番を更新**という分担がはっきりする。CD だけ先に繋いだ場合でも、以降は PR で Preview を見てから `main` にマージする習慣に揃える。

---

## フェーズ5の完了チェックリスト

- [ ] 開発コンテナ内で `web/` の `pnpm run build` が通る。
- [ ] GitHub Actions に `NEXT_PUBLIC_SUPABASE_*` の repository secret があり、CI の **Build** が緑になる。
- [ ] クラウド Supabase に `todos` があり、`supabase db push`（または同等）でマイグレーションを反映した。
- [ ] Vercel で GitHub リポジトリを **Import** し、**Root Directory** を **`web`** にした。
- [ ] New Project 画面で `NEXT_PUBLIC_SUPABASE_*` を入れ **Deploy** し、**Production** デプロイが成功した。
- [ ] `main` のデプロイ（Production）が成功し、本番 URL でアプリが開ける。
- [ ] PR を1本出し、Preview URL で見出しが **ToDo一覧** に変わったことを確認した（**6.**）。
- [ ] Supabase **URL Configuration** に Production / Preview / ローカルの Redirect URL を登録した（**8.**）。
- [ ] （任意）`main` マージ後に Production が更新されることを Deployments で確認した。

次は **フェーズ6（`phase6-ship-a-change.md`：修正してリリースの一周 ＋ CI の最適化）** に進む。アプリの機能を厚くする作業は、どのフェーズでも並行してよいが、**本番 DB を共有する Preview** では破壊的な変更に注意する。
