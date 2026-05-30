# フェーズ4：自動テスト・CI の準備（品質ゲート：Lint / 型チェック / Unit Test / E2E）— 具体手順

**前提（フェーズ3まで完了していること）**

- `web/` に Next.js + TypeScript アプリがある。
- Supabase 接続の最小確認ができている。
- 開発作業は原則、開発コンテナ内で実行している。

**このフェーズのゴール**

- ローカルで `lint` / `typecheck` / `test`（ユニット）を安定実行できる。
- **E2E（Playwright）の主要導線スモーク**を、ローカルでは任意手順として回せ、CI では PR の必須ゲートとして回せる。
- GitHub Actions で PR と `main` に対して同じ品質ゲートを実行できる。
- 「CI が赤ならマージしない」運用を始められる。

> **テストの置きどころ（方針）**
>
> - **ローカル（PR 前）**：`lint` / `typecheck` / `test`（ユニット）を必ず通す。**E2E は任意**（認証・ToDo 導線を触ったときに手元で回す）。
> - **PR の CI**：`lint` / `typecheck` / `test` に加え、**E2E スモーク 1 本を必須ゲート**にする（安いチェックが緑のときだけ E2E を走らせる）。
> - **重い全量 E2E は、将来スイートが育ってから**夜間やマージ後に回す（最初はスモーク 1 本でよい）。

---

## 1. スクリプトを統一する（`web/package.json`）

まず、品質チェック用の npm scripts を揃える。  
`web/package.json` に次の scripts がある状態を作る（名前はこのドキュメントに合わせる）。

```json
{
  "scripts": {
    "dev": "next dev -H 127.0.0.1 -p 3000",
    "build": "NODE_ENV=production next build",
    "start": "next start -H 127.0.0.1 -p 3000",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  }
}
```

> `start` / `e2e` は §5（E2E）で使う。`start` は Playwright の `webServer` がビルド後のアプリを起動するため、`e2e` は Playwright 実行用。  
> Next.js 16 以降は `next lint` が削除されているため、ESLint CLI（`eslint .`）を使う。  
> `typecheck` を独立させることで、「ESLint は通るが型で落ちる」ケースを CI で明示できる。
> 開発コンテナで `NODE_ENV=development` が固定されている場合でも、`build` だけは `NODE_ENV=production` で動くようにしておく。

---

## 2. テスト基盤を追加する（Vitest + Testing Library）

`web/` で次を実行する。

```bash
cd /workspace/web
pnpm add -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event happy-dom
```

Next.js の設定と競合しにくい、最小の Vitest 設定を追加する。

### 2.1 `vitest.config.mts` を作成

配置先（フルパス）: `/workspace/web/vitest.config.mts`

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

### 2.2 `src/test/setup.ts` を作成

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
```

---

## 3. 最小テストを1本作る

いきなり E2E ではなく、まずは「画面の純粋な表示ロジック」や「小さい関数」のテストを1本追加する。  
フェーズ3で `src/app/page.tsx` から切り出した **`TodoItem`**（表示専用コンポーネント）は、`page.tsx` 本体の Supabase 呼び出しを含まないため、そのまま単体テストしやすい。ここではこの `TodoItem` に対するテストを足す。

### 3.1 ファイル（フルパス）

- `/workspace/web/src/components/TodoItem.tsx`（表示コンポーネント。**フェーズ3で作成済み**。下記は再掲）
- `/workspace/web/src/components/TodoItem.test.tsx`（**このフェーズで追加**：描画とクリック動作のテスト）

### 3.2 コンポーネント実装（`TodoItem.tsx`、フェーズ3で作成済みの再掲）

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

### 3.3 テスト実装例（`TodoItem.test.tsx`）

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TodoItem } from "./TodoItem";

describe("TodoItem", () => {
  it("タイトルが表示される", () => {
    render(
      <TodoItem
        id="todo-1"
        title="牛乳を買う"
        isDone={false}
        onToggle={() => {}}
      />
    );

    expect(screen.getByText("牛乳を買う")).toBeInTheDocument();
  });

  it("チェック時に onToggle が呼ばれる", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(
      <TodoItem
        id="todo-1"
        title="牛乳を買う"
        isDone={false}
        onToggle={onToggle}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: "牛乳を買う の完了状態" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("todo-1", true);
  });
});
```

### 3.4 実行コマンド（`web/` で実行）

```bash
cd /workspace/web
pnpm run test
```

テストが 2 件とも通れば、このフェーズの最小ラインを満たす。  
最初は「表示 1 件 + イベント 1 件」のように小さく始め、以降はバグ修正に合わせてケースを増やしていく。

---

## 4. ローカル品質チェックの実行順を固定する

PR を作る前に、`web/` で次を実行する。

```bash
cd /workspace/web
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```

- `build` を最後に入れると、本番ビルド時の不足（環境変数・import ミス）を早く検出できる。
- 失敗したら修正して再実行し、4つすべてがグリーンになってから push する。
- **認証や ToDo 導線を変更したとき**は、加えて次の §5 の **E2E を手元で 1 回**回しておくと、PR の CI で初めて気づく事故を減らせる（任意）。

### 4.1 ここまでをコミット

4 つすべてが緑になったら、**テスト基盤＋ユニットテスト＋スクリプト**をコミットする（**開発コンテナ内**・カレント **`/workspace`**）。

```bash
cd /workspace
git add web
git status   # web/.env.local が含まれないこと
git commit -m "test: add vitest and unit tests"
```

---

## 5. E2E（Playwright）をローカルで回す（任意 / 主要導線スモーク）

ユニットテストは「部品」を速く守るもの。対して E2E は「**実際の画面 → Supabase（Auth + REST + RLS）**」までを通しで確認する。ここでは **方式A（ローカル / CI ランナー内に Supabase を立てて、その DB に対して実行）** で、主要導線のスモークを 1 本だけ用意する。

> **方式Aとは**：別途 staging を用意せず、`supabase start` でローカル（または CI ランナー内）に Supabase 一式を起動し、その DB に **その時点の `supabase/migrations`** を当ててからテストする。コードとスキーマが常に一致するため、**マイグレーションを伴う変更も同じブランチ内で検証**できる。

### 5.1 Playwright を導入する（`web/` で実行）

```bash
cd /workspace/web
pnpm add -D @playwright/test
pnpm exec playwright install --with-deps chromium
```

- アプリ起動用に `web/package.json` に `start` を足し、E2E 実行用に `e2e` を足す。

```json
{
  "scripts": {
    "start": "next start -H 127.0.0.1 -p 3000",
    "e2e": "playwright test"
  }
}
```

### 5.2 `web/playwright.config.ts` を作成

アプリの起動は Playwright の `webServer` に任せる（`build` → `start`）。ローカルで既に `dev` が動いていればそれを再利用する。

```ts
import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm run build && pnpm run start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

### 5.3 スモーク 1 本 `web/e2e/todo.spec.ts`

メール / パスワード認証なので、ユーザ作成からログイン、ToDo 操作まで**フォーム操作だけ**で完結する。メールは run ごとにユニークにして衝突を避ける。

```ts
import { test, expect } from "@playwright/test";

test("ToDo の主要導線（サインアップ→ログイン→追加→完了→削除→ログアウト）", async ({
  page,
}) => {
  const unique = Date.now();
  const email = `e2e_${unique}@example.com`;
  const password = "password123";
  const title = `買い物 ${unique}`;

  await page.goto("/login");
  await page.getByLabel("email").fill(email);
  await page.getByLabel("password").fill(password);
  await page.getByRole("button", { name: "サインアップ" }).click();
  await expect(page.getByText("サインアップしました。ログインしてください")).toBeVisible();

  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "ToDo" })).toBeVisible();

  await page.getByLabel("やること").fill(title);
  await page.getByRole("button", { name: "追加" }).click();
  await expect(page.getByText(title)).toBeVisible();

  // 完了切り替えは「DB 更新→再フェッチ後に反映」されるため、click + ポーリング検証にする
  const checkbox = page.getByRole("checkbox", { name: `${title} の完了状態` });
  await checkbox.click();
  await expect(checkbox).toBeChecked();

  await page.getByRole("button", { name: `${title} を削除` }).click();
  await expect(page.getByText(title)).toHaveCount(0);

  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page).toHaveURL("/login");
});
```

> **`check()` ではなく `click()` ＋ `expect(...).toBeChecked()`**：本アプリのチェックボックスは「更新を DB に投げ → 再フェッチして再描画」で反映される**制御コンポーネント**のため、クリック直後に状態変化を同期検証する `check()` は失敗しやすい。`click()` の後にポーリング型の `toBeChecked()` で待つ。

### 5.4 生成物を Git 管理から外す（`web/.gitignore`）

Playwright の生成物（`test-results/` など）は **`web/` 配下**に出るため、**`web/.gitignore`** に追記する（`web/` の生成物はルートではなく `web/.gitignore` で管理する方針。フェーズ3 §2）。

```gitignore
# playwright
/test-results/
/playwright-report/
/blob-report/
/playwright/.cache/
```

### 5.5 ローカル実行

```bash
# 1) ルートでローカル Supabase を起動（migration 適用済みの DB を用意）
cd /workspace
supabase start
supabase db reset   # 既存 DB をまっさらにして全 migration を当て直す

# 2) web で E2E を実行（webServer が build→start を行う）
cd /workspace/web
pnpm run e2e
```

- `.env.local` がローカル値（`http://127.0.0.1:54321` と `supabase status` の Publishable key）になっていること。
- `1 passed` になればスモーク成功。

### 5.6 方式Aで理解しておくべき制限

- **本番そのものではない**：接続先は CLI が立てる**ローカル Supabase** であり、**ダッシュボードでしか設定しない項目**（本番 Redirect URL、SMTP、メール確認 ON/OFF、レート制限）や **Vercel 固有の挙動**は検証できない。`config.toml` と本番設定の乖離（config drift）に注意する。本番に近い確認はフェーズ5の Preview スモークで補う。
- **データは空**：テスト内でサインアップ・追加など**前提状態を自前で作る**。メールは run ごとにユニークにし、並列時は**ユーザ単位で分離**（RLS により他人の行は見えない）。
- **イメージ取得が重い / レート制限**：フェーズ2 §4.2 で `config.toml` を最小構成にしていれば pull は抑えられている。それでも `toomanyrequests` 等で失敗する場合は再実行やランナー側のキャッシュを検討する。
- **flaky 対策**：固定 `sleep` を避け、`expect(locator).toBeVisible()` などの **web-first アサーション**で UI 反映を待つ。
- **スキーマは検証できるがデータ移行は別物**：`db reset` は空 DB に migration を当てるだけなので、**本番相当データに対する破壊的変更（バックフィル・ロック）**は検証できない。

### 5.7 ここまでをコミット

E2E スモークがローカルで緑（`1 passed`）になったら、Playwright 一式（`playwright.config.ts` / `e2e/` / `web/.gitignore` の追記 / `package.json` の `start`・`e2e`）をコミットする。

```bash
cd /workspace
git add web
git status   # test-results / playwright-report が含まれないこと（5.4 で除外）
git commit -m "test: add playwright e2e smoke"
```

---

## 6. GitHub Actions を作成する

リポジトリルートに `.github/workflows/ci.yml` を作成する。**2 つのジョブ**を持たせる。

- `quality`：`lint` / `typecheck` / `test`（ユニット）/ `build`。安く速い。`web/` で実行する。
- `e2e`：**方式A**で Playwright スモークを回す（`needs: quality` で、安いチェックが緑のときだけ実行）。`supabase` 系はリポジトリルートで、`web` 系は `web/` で実行する。

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  quality:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: web
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: "pnpm"
          cache-dependency-path: web/pnpm-lock.yaml

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm run lint

      - name: Typecheck
        run: pnpm run typecheck

      - name: Test
        run: pnpm run test

      - name: Build
        run: pnpm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}

  # 方式A：ランナー内に Supabase を起動し、PR の migration を当てた DB に対して
  # Playwright スモーク（主要導線 1 本）を回す。quality が緑のときだけ実行する。
  e2e:
    needs: quality
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: "pnpm"
          cache-dependency-path: web/pnpm-lock.yaml

      - name: Install dependencies
        working-directory: web
        run: pnpm install --frozen-lockfile

      # ローカル開発の CLI とバージョンを揃える（config.toml との不整合を避ける）
      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: 2.98.2

      # リポジトリルートの supabase/ を使う。start で migrations が適用される。
      - name: Start Supabase
        run: supabase start

      - name: Export Supabase env
        run: |
          echo "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321" >> "$GITHUB_ENV"
          ANON_KEY=$(supabase status -o env | grep '^ANON_KEY=' | cut -d= -f2- | tr -d '"')
          echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY" >> "$GITHUB_ENV"

      - name: Install Playwright browser
        working-directory: web
        run: pnpm exec playwright install --with-deps chromium

      # webServer（playwright.config.ts）が build → start を行う。
      - name: Run E2E (smoke)
        working-directory: web
        run: pnpm run e2e

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: web/playwright-report
          retention-days: 7

      - name: Stop Supabase
        if: always()
        run: supabase stop
```

ポイント:

- `quality` の `build` は `NEXT_PUBLIC_*` を参照する。GitHub の **Settings** → **Secrets and variables** → **Actions** に Supabase の Project URL と anon キーを同名の repository secret として登録する（手順の詳細は **フェーズ5の 1.2**）。
- `e2e` は**ランナー内のローカル Supabase**を使うため、**シークレット不要**。URL / anon キーは `supabase status` から取得して `GITHUB_ENV` に流し込む（ハードコードしない）。
- `supabase start` のイメージ取得は初回が重い。フェーズ2 §4.2 の最小構成 `config.toml` を入れていれば pull は既に抑えられている。遅さ・`toomanyrequests` が気になるなら、ランナー側の Docker キャッシュを検討する。

### 6.1 Node / Supabase CLI のバージョンを揃える

- `actions/setup-node` の `node-version` は、フェーズ2/3で固定したメジャー（例: `24`）と合わせる。
- `supabase/setup-cli` の `version` は、開発コンテナの CLI と合わせて**ピン留め**する（`latest` だと `config.toml` のスキーマと食い違ってエラーになり得る）。
- 将来上げるときは、`.devcontainer/Dockerfile` / `.nvmrc` / CI を同時に更新する。

### 6.2 `ci.yml` をコミットして push（CI を起動する）

`ci.yml` はリポジトリルートの **`.github/workflows/`** に置く。push して初めて GitHub Actions が走る。

```bash
cd /workspace
git add .github/workflows/ci.yml
git commit -m "ci: add quality and e2e workflow"
git push -u origin main   # PR で確認したい場合はブランチへ push して PR を作る
```

- 初回は **フェーズ5 §1.2** の repository secret（`NEXT_PUBLIC_SUPABASE_*`）が無いと `quality` の **Build** で落ちる。先に登録しておくか、赤を確認してから登録して再 push する。
- **§7 のブランチ保護を有効化した後は `main` への直接 push が制限される**ため、以降は PR 経由にする。

---

## 7. ブランチ保護（推奨）

GitHub の対象リポジトリで次を設定する。

1. **Settings** -> **Rules** -> **Rulesets** -> **New ruleset** -> **New branch ruleset**
2. Ruleset name を入力（例: `protect-main`）
3. **Target branches** で `Add target` -> `Include by pattern` -> `main`
4. **Require status checks to pass** を有効化
5. 必須チェックに CI の **`quality` と `e2e`** の両ジョブを追加する
6. （推奨）**Require a pull request before merging** も有効化する
7. **Enforcement status** を `Active` にして保存する

これで、CI（ユニット・型・Lint・**E2E スモーク**）が赤のまま `main` に入る事故を減らせる。

---

## 8. このフェーズでの運用ルール

- PR 作成前にローカルで `lint` / `typecheck` / `test` / `build` を通す（導線を変えたときは `e2e` も手元で 1 回）。
- PR で CI が赤なら、原因を直して再 push するまでマージしない。
- テストは最初から網羅を目指さず、「バグを防ぎたい箇所から小さく追加」を徹底する。E2E は**主要導線スモーク 1 本**から始め、増やすのは慣れてから。

---

## よくある失敗ポイント

- `tsconfig` の `paths` と Vitest の `alias` が不一致で import 解決に失敗する。
- `test` スクリプトが `watch` のままで、CI が終了しない。
- `working-directory: web` を忘れ、CI がルートで `pnpm` 実行して失敗する。
- Node のメジャー不一致で、ローカルは成功・CI は失敗になる。
- E2E：ブラウザの OS ライブラリ不足（`libglib-2.0.so.0` など）で起動失敗 → `playwright install --with-deps` を使う。
- E2E：`e2e` ジョブで `supabase` 系を `web/` で実行してしまい `supabase/` が見つからない → `supabase` 系はルート、`web` 系のみ `working-directory: web`。
- E2E：非同期反映の UI に対し `check()` など同期検証を使い flaky 化 → `click()` ＋ `expect(...).toBeChecked()` のような web-first アサーションにする。

---

## フェーズ4の完了チェックリスト

- [ ] `web/package.json` に `lint` / `typecheck` / `test` / `build` / `start` / `e2e` が定義されている。
- [ ] Vitest + Testing Library の最小構成が入り、ユニットテストが1本以上ある。
- [ ] `@playwright/test` を導入し、`playwright.config.ts` と `e2e/todo.spec.ts`（主要導線スモーク）がある。
- [ ] ローカルで `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` が通る。
- [ ] ローカルで `supabase start` ＋ `pnpm run e2e` のスモークが通る。
- [ ] ユニット（**4.1**）・E2E（**5.7**）・`ci.yml`（**6.2**）を区切りごとにコミットし、push した。
- [ ] `.github/workflows/ci.yml` に `quality` と `e2e`（方式A）があり、PR と `main` で走る。
- [ ] （推奨）`main` の branch protection で `quality` と `e2e` の成功を必須にした。

次は **フェーズ5（CD の線：Vercel 本番/プレビュー運用）** に進む。
