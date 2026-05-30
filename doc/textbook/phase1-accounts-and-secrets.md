# フェーズ1：アカウント・連携・シークレット — 具体手順

**全フェーズ共通の前提（本手順書の範囲外。事前にセットアップ済みであること）**

- **Ubuntu** に **Docker Engine** と **Docker Compose プラグイン**（`docker compose`）がインストール済みで、`docker run --rm hello-world` が動く。
- 自分のユーザーが `docker` グループに入っており、`docker ps` が **sudo なし**で実行できる。
- これら Docker / Compose のセットアップ（インストール・権限設定）は本手順書では扱わない。未了の場合は [Install Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/) に従って先に済ませておく（実際に使うのはフェーズ2以降）。

前提として、ブラウザで作業し、メモ帳かパスワードマネージャに一時メモしてよいが、**service_role キーや Database のパスワードは共有・スクショ公開しない**。

---

## 1. GitHub

### 1.1 アカウント（未所持の場合）

1. [https://github.com/signup](https://github.com/signup) を開く。
2. メール・パスワード（またはパスキー）で登録し、表示名を設定する。
3. メール認証を完了する。

### 1.2 二要素認証（2FA）の有効化（推奨）

1. GitHub にログインし、右上のアバター → **Settings**。
2. 左メニュー **Password and authentication**。
3. **Two-factor authentication** で **Enable** を選び、Authenticator アプリまたはセキュリティキーで設定する。

### 1.3 学習用リポジトリの用意（このフェーズで「名前だけ」決めてもよい）

1. 右上 **+** → **New repository**。
2. **Repository name**（例: `ci-cd-study`）、**Public** / **Private** を選ぶ。
3. **Add a README** は好み（後から Next.js を push するなら空でも可）。
4. **Create repository**。

※ アプリの初期コミットはフェーズ3以降で行う想定。フェーズ1では「リポジトリが存在する」状態で十分。

---

## 2. Vercel

### 2.1 アカウント作成

1. [https://vercel.com/signup](https://vercel.com/signup) を開く。
2. **Continue with GitHub** を選ぶ（GitHub 連携が最短）。
3. GitHub の OAuth 画面で **Authorize Vercel**（表示される権限は公式の範囲内で確認して許可）。

### 2.2 GitHub 側のインストール範囲

初回、GitHub が「Vercel をどのリポジトリに入れるか」と聞くことがある。

- **All repositories** か **Only select repositories** か選ぶ。
- 学習用なら、対象リポジトリだけに限定（**Only select repositories** + 学習用リポ）でもよい。

### 2.3 このフェーズで行わないこと

- **GitHub リポジトリの Import（Vercel Project の作成）** は **フェーズ5** で行う。フェーズ1では、アカウント作成・GitHub 連携（**2.1**）と、Vercel に許可するリポジトリのアクセス範囲の設定（**2.2**）まででよい。
- Vercel の環境変数（`NEXT_PUBLIC_SUPABASE_*`）も **フェーズ5** で、Import 直前または直後に設定する。

---

## 3. Supabase

### 3.1 アカウント作成

1. [https://supabase.com/dashboard/sign-up](https://supabase.com/dashboard/sign-up) を開く。
2. **Sign in with GitHub** 等で登録（メール登録でも可）。

### 3.2 新規プロジェクト作成

1. ダッシュボードを開く。初回アクセス時はダッシュボードを開くと Organization の登録画面が表示されるので、`Sandbox` 等の適当な名前で Organization を作成する（Plan は Free、Type は Personal のままで可）。
2. Organization を作成した直後は **Create a new project** 画面に遷移するので、そのまま続ける。それ以外の場合は、ダッシュボードでプロジェクトを作成する Organization を選び **New project** を押す。
3. **Name**: 任意（例: `ci-cd-study`）。
4. **Database Password**: 強いパスワードを生成し、**パスワードマネージャ等に保存**（後で直接貼る機会は少ないが紛失すると困る）。
5. **Region**: 利用者・Vercel のリージョンに近いもの（例: 日本なら Tokyo があれば Tokyo）。
6. **Create new project** を押し、プロビジョニング完了まで待つ（数分かかることがある）。

### 3.3 API アクセス用の Project URL と公開キーの取得

ブラウザ（クライアント）から Supabase に接続するための **Project URL** と **公開キー（anon key）** を取得する。

> ⚠️ **キーの貼り付け先に注意（Git に載せない）**
> - コピーした値は **Git 管理されないファイル**にだけ貼ること。リポジトリ内に置くなら必ず **`.env.local`**（`.gitignore` 対象）に書く。後で `.env.local` を作るまでは、**リポジトリ外**のメモ帳やパスワードマネージャに一時保存する。
> - `README.md` やソースコードなど **Git 管理対象のファイルに直接書かない**。一度コミットすると履歴に残り、push すると公開され得る。
> - anon キーは公開前提の公開キーだが、**Project URL とセットでの不要な露出は避ける**。`service_role` キーや DB パスワードは絶対に貼らない。

1. プロジェクト画面左下の歯車 **Project Settings**（または **Settings**）を開く。
2. **Project URL** を取得する。
   - **Data API**（旧 UI では **API**）を開く。
   - **Project URL** をコピー → これが `NEXT_PUBLIC_SUPABASE_URL` の値。`/rest/v1/` 等は付けず `https://<ref>.supabase.co` まで。
3. **公開キー（anon key）** を取得する。
   - **API Keys**（旧 UI では同じ **API** ページ内の **Project API keys**）を開く。
   - **anon** / **public** キーをコピー → これが `NEXT_PUBLIC_SUPABASE_ANON_KEY` の値。

### 3.4 Authentication（Email）の確認

本手順書は **Supabase Auth** を使う前提とする。

1. 左メニュー **Authentication** → **Sign in / Providers**。
2. **Email** が **Enabled** であることを確認する（新規プロジェクトでは通常オン）。
3. 学習用にメール確認を省略する場合: **Authentication** → **Sign In / Providers** → **Email** → **Confirm email** をオフにできる（本番ではオン推奨）。

### 3.5 service_role について

- **service_role** は **サーバー専用・絶対にブラウザや Git に載せない**。
- クライアントは **anon** キーのみ使う。ログイン後の操作権限は **RLS** で制御する。

### 3.6 Reference ID と DB パスワードの確認（マイグレーション CLI 用・後でよい）

フェーズ2 / フェーズ5 で `supabase link --project-ref <Reference ID>` を実行してクラウドにリンクし、`supabase db push` でマイグレーションを当てる。そのとき必要になるのは次の 2 つなので、ここで場所だけ把握しておく。

1. **Project Settings** → **General** の **Reference ID**。`supabase link --project-ref <Reference ID>` に渡す（API URL `https://<ref>.supabase.co` のサブドメイン部分と同じ）。
2. **DB パスワード**: 3.2 で保存したもの。`supabase link` 実行時に対話で聞かれる。

フェーズ1では「どこにあるか分かればよい」程度でよい。


---

## 4. GitHub Secrets（CI や自動マイグレーション用・最初はスキップ可）

最初はローカルと Vercel だけなら未設定でもよい。Actions で Supabase に触れるようになったら設定する。

### 4.1 代表例：`SUPABASE_ACCESS_TOKEN`

1. Supabase ダッシュボード → アカウントメニュー → **Access Tokens**（または [Account - Tokens](https://supabase.com/dashboard/account/tokens)）。
2. **Generate new token** でトークンを作成し、**一度だけ表示される文字列をコピー**。
3. GitHub リポジトリ → **Settings** → **Secrets and variables** → **Actions**。
4. **New repository secret** — Name: `SUPABASE_ACCESS_TOKEN`、Secret: 貼り付け。

### 4.2 その他、よく使う名前（必要になったら）

- `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` — CLI や Actions から Vercel にデプロイするとき。
- `SUPABASE_PROJECT_REF` — スクリプトでプロジェクトを指定するとき。

プロジェクト ref は Supabase の **Project Settings** → **General** の **Reference ID** で確認できる。

---

## フェーズ1の完了チェックリスト

- [ ] （前提・範囲外）Ubuntu に Docker Engine と `docker compose` があり `hello-world` が動く、かつ `docker ps` が **sudo なし**で動く（未了ならフェーズ2に入る前に済ませる）。
- [ ] GitHub アカウントが作成済み。
- [ ] 学習用リポジトリが GitHub 上に存在する。
- [ ] Vercel にログインでき、GitHub 連携と、対象リポジトリへのアクセス範囲の設定が済んでいる。
- [ ] Supabase にプロジェクトがあり、**Project URL** と **anon public キー**を安全な場所に控えた。
- [ ] Supabase **Authentication** の **Email** プロバイダが有効である。
- [ ] （任意）将来の CI 用に GitHub Actions の Secrets 方針をメモした。

次は **フェーズ2（ローカル開発環境）** に進む（Vercel への Import は **フェーズ5**）。
