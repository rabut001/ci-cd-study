# フェーズ3：アプリの土台（Next.js + Supabase）— 具体手順

**前提（フェーズ2まで完了していること）**

- リポジトリに `.devcontainer` 一式があり、開発コンテナに入って作業できる。
- パッケージマネージャは `pnpm` に固定している。
- **フェーズ2 §5 で Git を初期化し、`origin` を設定して初回コミット済み**（未実施なら先にフェーズ2 §5）。
- Supabase プロジェクト（クラウド）があり、`Project URL` と `anon public key` を控えている。

**レイアウトの前提**

- Git の管理対象はリポジトリルート **`/workspace`** とする。
- Next.js アプリは **`/workspace/web`** に置く。

**このフェーズのゴール**

- 開発コンテナ内で Next.js（TypeScript + App Router）を起動できる。
- `dev` サーバーは `127.0.0.1` にのみバインドされる。
- **Supabase Auth**（メール / パスワード）でログインし、ブラウザに保持されたセッションで操作できる。
- `todos` テーブルを **`auth.uid()` ベースの RLS** でマイグレーション管理できる。

> **このフェーズの実装方針**
>
> - **サーバー側の API は実装しない**。データ操作は **Supabase の Auto-generated REST API**（`@supabase/supabase-js` 経由）に任せ、**フロントエンドだけ**を実装する。
> - **認証は Supabase Auth（メール / パスワード）** に任せる。`@supabase/ssr` や Next.js の Middleware / サーバークライアントは使わず、**ブラウザクライアントのみ**でセッションを保持する（コードを最小・単純に保つため）。
> - **ToDo は登録したユーザだけが参照・更新・削除できる**。この制御は **Supabase の RLS（`auth.uid() = user_id`）** に任せる。
> - **ToDo はタイトルと完了済みフラグの 2 つだけ**を持つ最小構成にする。スタイルも最小限とし、コードのシンプルさを最優先する。

---

## 1. 開発コンテナに入り、Next.js ひな形を作る

以降のコマンドは原則、**開発コンテナ内**で実行する。

```bash
mkdir -p /workspace/web
cd /workspace/web
pnpm create next-app@latest . --ts --app --eslint --src-dir --import-alias "@/*"
```

### 1.1 `create-next-app` 実行時の注意

- `web` は**空に近い状態**で実行する（空でない場合は上書き確認が出るので、内容を確認して進める）。
- `create-next-app` が Git 初期化を聞いてきた場合、リポジトリルートを `/workspace` で管理するなら **No** とし、`web` の中で `git init` だけが残らないようにする。
- `Turbopack` の有効化は好みでよい（学習用途なら既定値で問題ない）。
- 生成直後に `pnpm install` は通常完了済みだが、必要なら `pnpm install` を再実行する。

### 1.2 （参照）ルートからフォルダ名を明示する場合

同一の結果にしたいだけなら、ルートで `pnpm create next-app@latest web ...` とすることもできる。この手順書では **`cd web` → `.`** を前提とする。

---

## 2. `.gitignore` を整える（`web/` とルートの役割分担）

`.gitignore` は **2 つ**あり、役割を分ける。

- **ルート `/workspace/.gitignore`**（フェーズ2 §5.1 で配置済み）: `.env*` / `*.local` の**安全網**と、`web/` の外に出る生成物（`.pnpm-store/`、`.cursor/`、`supabase/.temp/` など）。
- **`web/.gitignore`**（次の `create-next-app` が生成）: **`web/` の依存・ビルド・テスト成果物**（`node_modules` / `.next` / `out` / `coverage` / `next-env.d.ts`、Playwright 出力など）。

**pnpm 系の依存・ビルド成果物は `web/.gitignore` 側で管理し、ルートには重複して書かない**（秘密情報の `.env*` / `*.local` だけは安全網として両方に入る）。

### 2.1 `web/.gitignore`（`create-next-app` が生成。無ければ作成）

通常は **`create-next-app` が `web/.gitignore` を自動生成**しているので、まず存在と中身を確認する。

```bash
cat /workspace/web/.gitignore
```

**無い場合・内容が異なる場合**は、エディタで **`/workspace/web/.gitignore`** を作成（または上書き）し、次の内容にする（`create-next-app` の生成物に相当）。

```gitignore
# See https://help.github.com/articles/ignoring-files/ for more about ignoring files.

# dependencies
/node_modules
/.pnp
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/versions

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# env files (can opt-in for committing if needed)
.env*

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts
```

- **`.env*` が含まれる**ので、§6 で作る **`web/.env.local` は Git に載らない**（重要）。
- `node_modules` / `.next/` / ビルド成果物 / ログ / `next-env.d.ts` などもここで除外される。
- **Playwright を入れる際の追記（`/test-results/` など）は、フェーズ4 §5.4 で行う**（このフェーズではまだ不要）。

### 2.2 ルート `/workspace/.gitignore` の確認（フェーズ2 §5.1 で配置済み）

ルートの `.gitignore` は **フェーズ2 §5.1** で、`git init` の前に配置している（`.env*` / `*.local` の安全網と、`.pnpm-store/`・`.cursor/`・`supabase/.temp/` などルート固有の生成物）。ここでは内容を確認するだけでよい。

```bash
cat /workspace/.gitignore   # .env* / *.local が含まれていること
```

- **まだ無い場合は、先にフェーズ2 §5.1 の内容で作成**してから先に進む（`web/.env.local` を作る §6 より前に置くことが重要）。
- **役割分担**：`web/` の依存・ビルド・テスト成果物は **2.1 の `web/.gitignore`** が担当し、ルートには重複して書かない。`web/` の外にだけ現れるツール生成物が増えたときだけ、ルートに追記する。

---

## 3. Git の確認（初期化はフェーズ2 §5 で実施済み）

Git の初期化・`origin` 設定・初回コミット（devcontainer / Supabase 設定）は **フェーズ2 §5** で済ませている前提。ここでは状態だけ確認する（**開発コンテナ内**・カレント **`/workspace`**）。

```bash
cd /workspace
git remote -v   # origin が設定済みか
git status      # 追跡対象とステージ状況
```

- まだ初期化していない場合は **フェーズ2 §5**（`git init` / `user.name`・`user.email` / `safe.directory` / `git branch -M main` / `git remote add origin`）に戻ってから先に進む。
- **1.1** の注意どおり、`create-next-app` が **`web/` 内に `.git` を作ってしまった**場合は、その `web/.git` を削除してルート **`/workspace`** の単一リポジトリに統一する。

---

## 4. 開発サーバーをループバックのみに固定する

README の方針どおり、`dev` は `127.0.0.1` バインドにする。

**`web/package.json`** の `scripts.dev` を次のようにする。

```json
{
  "scripts": {
    "dev": "next dev -H 127.0.0.1 -p 3000"
  }
}
```

起動確認（**`web` ディレクトリで**）:

```bash
cd /workspace/web
pnpm run dev
```

- ブラウザは `http://127.0.0.1:3000` にアクセスする。
- `0.0.0.0` バインドにはしない（不要な公開範囲を広げないため）。

---

## 5. Supabase パッケージを導入する

ブラウザから Supabase の Auth と Auto-generated REST API を呼ぶため、**`@supabase/supabase-js`** だけを入れる（**`web` で実行**）。サーバー側のセッション処理（`@supabase/ssr` / Middleware）は本手順では使わない。

```bash
cd /workspace/web
pnpm add @supabase/supabase-js
```

---

## 6. 環境変数を定義する（`.env.local`）

Next.js はプロジェクトルートの環境ファイルを読むため、**`web/.env.local`** を作成または更新する。

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-public-key>
```

- `.env.local` は Git にコミットしない。
- 値は Supabase ダッシュボードの Project Settings -> API（または Data API の API URL）で確認する。URL に `/rest/v1/` が付いていても `https://<ref>.supabase.co` まで（パスなし）を指定する。
- **ローカル（Supabase CLI）で開発・動作確認する場合**は、`supabase start` 後に `supabase status` が表示する **Project URL（例: `http://127.0.0.1:54321`）** と **Publishable key**（`anon` 相当）を使う。本フェーズの動作確認（§9・§10）はこのローカル値で進める。

```bash
# 例：ローカル CLI 開発時の web/.env.local
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase status の Publishable key>
```

---

## 7. Supabase クライアントとログイン画面（Auth）

サーバークライアントや Middleware は作らない。**ブラウザ用クライアント 1 つ**を使い回し、画面側（Client Component）から Auth と REST API を呼ぶ。

### 7.1 ブラウザ用 `src/lib/supabase/client.ts`

`@supabase/supabase-js` の `createClient` をそのまま使う。ブラウザでは既定でセッションが保存・自動更新される。

```ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase environment variables are not set");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

### 7.2 ToDo 1 行分の表示コンポーネント `src/components/TodoItem.tsx`

一覧の各行（チェックボックス + タイトル）を小さな表示専用コンポーネントに分けておく。`page.tsx` から使い、フェーズ4ではこのコンポーネントに**単体テスト**を足す。

```tsx
type TodoItemProps = {
  id: string;
  title: string;
  isDone: boolean;
  onToggle: (id: string, nextDone: boolean) => void;
};

export function TodoItem({ id, title, isDone, onToggle }: TodoItemProps) {
  return (
    <label>
      <input
        type="checkbox"
        checked={isDone}
        aria-label={`${title} の完了状態`}
        onChange={(e) => onToggle(id, e.currentTarget.checked)}
      />
      <span>{title}</span>
    </label>
  );
}
```

### 7.3 ログイン / サインアップ画面 `src/app/login/page.tsx`

最小のメール / パスワードフォームを置く（Client Component）。ログイン成功後は `useRouter().replace("/")` で一覧へ遷移する。

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function signUp() {
    const { error } = await supabase.auth.signUp({ email, password });
    setMessage(error ? error.message : "サインアップしました。ログインしてください");
  }

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
      return;
    }
    router.replace("/");
  }

  return (
    <main>
      <h1>ログイン</h1>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email"
        aria-label="email"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="password"
        aria-label="password"
      />
      <button type="button" onClick={signIn}>ログイン</button>
      <button type="button" onClick={signUp}>サインアップ</button>
      {message && <p>{message}</p>}
    </main>
  );
}
```

- ローカルは `config.toml` の `enable_confirmations = false`（メール確認オフ）なので、**サインアップ直後にそのままログイン**して `/` へ進める。
- フェーズ5で Vercel URL を Supabase の Redirect URLs / Site URL に登録するまで、本番 / Preview のメール内リンクのリダイレクト先に注意する（メール / パスワードのみなら Import 前でもローカルは動く）。

---

## 8. `todos` の最小スキーマをマイグレーションで作る

すでに `supabase init` 済みであれば、次でマイグレーションを作成する。

```bash
supabase migration new create_todos_table
```

生成された `supabase/migrations/<timestamp>_create_todos_table.sql` に、最小例として次を記述する。

```sql
create extension if not exists pgcrypto;

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title text not null,
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.todos enable row level security;

create policy "Users read own todos"
  on public.todos for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users insert own todos"
  on public.todos for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users update own todos"
  on public.todos for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own todos"
  on public.todos for delete
  to authenticated
  using (auth.uid() = user_id);
```

> **anon** ロール向けポリシーは置かない。未ログインのクライアントは RLS で拒否される。

---

## 9. ローカル DB に適用して動作確認する

```bash
supabase start
supabase db reset
supabase status
```

- `supabase db reset` でローカル DB を再生成し、マイグレーション適用結果を確認できる。
- 起動後に表示されるローカルの URL / anon key は、必要ならローカル検証用に `.env.local` へ反映する。

---

## 10. ToDo 画面（一覧・追加・完了・削除）

`src/app/page.tsx` を **Client Component** にする。マウント時に `getUser()` でログイン状態を確認し、未ログインなら `/login` へ誘導する。一覧の読み書きはすべてブラウザクライアントから Supabase の REST API を呼ぶだけで、所有者以外の行は RLS が自動的に弾く（`user_id` は DB の `default auth.uid()` に任せる）。

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { TodoItem } from "@/components/TodoItem";

type Todo = {
  id: string;
  title: string;
  is_done: boolean;
};

export default function Page() {
  const router = useRouter();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("todos")
      .select("id, title, is_done")
      .order("created_at", { ascending: false });
    setTodos(data ?? []);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      await load();
      setLoading(false);
    });
  }, [router, load]);

  async function addTodo(e: React.FormEvent) {
    e.preventDefault();
    const value = title.trim();
    if (!value) return;
    await supabase.from("todos").insert({ title: value });
    setTitle("");
    await load();
  }

  async function toggle(id: string, nextDone: boolean) {
    await supabase.from("todos").update({ is_done: nextDone }).eq("id", id);
    await load();
  }

  async function remove(id: string) {
    await supabase.from("todos").delete().eq("id", id);
    await load();
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <main>
        <p>読み込み中...</p>
      </main>
    );
  }

  return (
    <main>
      <h1>ToDo</h1>
      <button type="button" onClick={signOut}>
        ログアウト
      </button>
      <form onSubmit={addTodo}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="やること"
          aria-label="やること"
        />
        <button type="submit">追加</button>
      </form>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            <TodoItem
              id={todo.id}
              title={todo.title}
              isDone={todo.is_done}
              onToggle={toggle}
            />
            <button
              type="button"
              onClick={() => remove(todo.id)}
              aria-label={`${todo.title} を削除`}
            >
              削除
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

### 10.1 確認手順

1. **開発サーバーを起動し、サインアップ → ログインする。**

   1. **開発コンテナ内**・**`web` ディレクトリ**で開発サーバーを起動する。

      ```bash
      cd /workspace/web
      pnpm run dev
      ```

      - 起動ログに `Local: http://127.0.0.1:3000` が出ることを確認する（`dev` は `127.0.0.1` バインド）。
      - 起動前に **§9 の `supabase start` でローカル Supabase が動いていること**、`web/.env.local` がローカル値（`http://127.0.0.1:54321` と `supabase status` の Publishable key）になっていることを確認する（未設定だと画面表示時に「Supabase environment variables are not set」で落ちる）。
   2. ブラウザで **`http://127.0.0.1:3000/login`** を開く。
   3. **サインアップ**: `email`（例: `test@example.com`）と `password`（6 文字以上）を入力し、**サインアップ** ボタンを押す。`サインアップしました。ログインしてください` と表示されれば登録成功。
      - ローカルは `config.toml` の `enable_confirmations = false`（メール確認オフ）なので、**確認メールのリンクを開かずにそのままログインへ進める**。
      - メール送信を伴う設定を試している場合は、送信内容を **Mailpit（`http://127.0.0.1:54324`）** で確認できる。
   4. **ログイン**: 同じ `email` / `password` のまま **ログイン** ボタンを押す。成功すると `useRouter().replace("/")` で **`/`（ToDo 画面）へ自動遷移**する。失敗時はフォーム下にエラーメッセージが出るので、文言に従って入力やユーザ登録を見直す。
2. `/` に遷移したら、入力欄に文字を入れて **追加** → 一覧に出る。チェックで完了状態が切り替わり、**削除** で消える。
3. **ログアウト**すると `/login` に戻り、未ログインで `/` を開くと `/login` に誘導されれば Auth + RLS + 接続は成功。
4. （任意）所有者制御の確認は、別メールでもう 1 ユーザ作り、互いの ToDo が見えないことを確かめる。

### 10.2 よくある失敗ポイント

- 未ログインのまま `/` を開く → `router.replace("/login")` で誘導される（正常）。
- `.env.local` の URL / anon キーが誤っている（ローカルは `supabase status` の Project URL / Publishable key）。
- `supabase db reset` 未実行、または **anon 向けの全許可ポリシー**のまま（本手順書の SQL を再適用する）。
- ログインしているのに行が増えない / `permission denied` → ポリシーの `auth.uid() = user_id` と、`user_id` の `default auth.uid()` を確認する。

スタイルの作り込みはフェーズ4以降に回し、ここでは動作優先で最小限にとどめる。

---

## 11. このフェーズのコミット

初回コミット（devcontainer / Supabase 設定）は **フェーズ2 §5** で済んでいる。このフェーズの成果物は、**`pnpm run dev` と `supabase db reset` が通る（§9・§10）ことを確認してから**コミットする。作業は **開発コンテナ内**・カレント **`/workspace`**。

小さく分けるとレビューしやすい（区切りごとに下記を実行してもよい）。まとめて行う場合は次の 2〜3 コミットにする。

```bash
cd /workspace

# 1) Next.js アプリ一式（ひな形 + Supabase クライアント / login / ToDo 画面 / dev スクリプト）
git add web .gitignore
git status   # web/.env.local が含まれないこと（web/.gitignore の .env* で除外）
git commit -m "feat: add Next.js app with supabase auth & todo UI"

# 2) todos マイグレーション（user_id + authenticated 向け RLS）
git add supabase/migrations
git commit -m "feat: add todos table with RLS migration"

# まとめて push（CI はフェーズ4で追加するので、ここでは push のみ）
git push -u origin main
```

- もっと細かくしたい場合は、**§1〜§4 の直後に「ひな形だけ」**（`git add web .gitignore && git commit -m "chore: scaffold Next.js app"`）を切り、**§5〜§10 の後にアプリ実装**を別コミットにする。
- `.env.local` や Supabase の鍵類はコミットしない（`git status` で確認）。

---

## フェーズ3の完了チェックリスト

- [ ] 開発コンテナ内で **`web` で** `pnpm run dev` が通り、`http://127.0.0.1:3000` で表示できる。
- [ ] **`web/package.json`** の `dev` が `next dev -H 127.0.0.1` になっている。
- [ ] `@supabase/supabase-js` を導入し、`src/lib/supabase/client.ts`（ブラウザクライアント）/ `src/components/TodoItem.tsx` / `src/app/login/page.tsx` / `src/app/page.tsx` を置いた（`@supabase/ssr` や Middleware は使わない）。
- [ ] `.env.local` に `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定した（Git 管理外）。
- [ ] `supabase/migrations` に `user_id` 付き `todos` と **authenticated 向け RLS** があり、`supabase db reset` で適用できる。
- [ ] `/login` でサインアップ・ログイン後、`/` で ToDo を追加・完了切り替え・削除でき、ログアウトできる。
- [ ] 動作確認後に **アプリ一式**と **`todos` マイグレーション**をコミットして `main` に push した（**11.**）。`.env.local` / 鍵類が含まれないことを確認した。

次は **フェーズ4（Lint / 型チェック / テストを品質ゲート化）** に進む。
