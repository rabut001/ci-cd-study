# フェーズ6：「修正してリリース」を一周する（ToDo に期限 `due_date` を追加）— 具体手順

## このフェーズでやること

フェーズ1〜5で整えた **CI / CD パイプライン**を使い、ToDo アプリに **期限（`due_date`）** を追加する実機能を、**本番（Vercel / Supabase）まで届ける**。

題材は **NULL 許容の `date` 列追加**なので前方互換（expand）であり、安全に「修正してリリース」の一周を体験できる。

---

## 前提

**フェーズ5まで完了していること**

- ローカルで `supabase start` / `pnpm run dev` が動く
- `lint` / `typecheck` / `test` / `e2e` / `build` が通る
- `.github/workflows/ci.yml` に `quality` と `e2e` があり、PR で必須ゲートになっている（フェーズ4）
- Vercel の Production / Preview が動き、クラウド Supabase に `todos` テーブルがある（フェーズ5）

**開始時点のアプリ**

- ToDo は **タイトル・完了・削除** のみ
- **期限フィールドはまだない**

**レイアウト**

| パス | 内容 |
|------|------|
| `/workspace` | Git リポジトリルート |
| `/workspace/web` | Next.js アプリ |
| `/workspace/supabase` | Supabase 設定・マイグレーション |

---

## ゴール

- [ ] `todos` に `due_date` 列を **マイグレーション**で追加する
- [ ] 追加フォーム・一覧で期限を **入力・編集**できる
- [ ] **ユニットテスト**と **E2E** に期限の検証を追加する
- [ ] PR で **CI**（`quality` → `e2e`）が緑になる
- [ ] **Preview** で目視確認し、`main` マージ後 **Production** に反映する

---

## 全体の流れ

| ステップ | 作業 | 章 |
|----------|------|-----|
| 1 | ブランチ `feat/todo-due-date` を切る | §1 |
| 2 | マイグレーションで `due_date` 列を追加 | §2 |
| 3 | 機能実装 → 動作確認 → テスト更新 → **1 本目コミット** | §3・§3.4・§4・§5 |
| 4 | 追加フォームの UI 改善 → **2 本目コミット** | §6 |
| 5 | push → PR 作成 → CI 確認 | §7 |
| 6 | `supabase db push` → Preview 確認 | §8 |
| 7 | `main` マージ → Production 反映 | §9 |
| 8 | （任意）タグ `v0.2.0` | §10 |
| 9 | （任意）CI 最適化 | §11 |

**コミット構成**: 2 本 / 1 PR

1. `feat: add due_date to todos` — migration + 機能 + テスト
2. `style: improve todo form layout and labels` — フォーム UI の改善

**各コミット前の確認**: `pnpm run dev`（目視）→ `lint` / `typecheck` / `test` / `build` / `e2e`

**変更するファイル**

| ファイル | 内容 |
|----------|------|
| `supabase/migrations/` | `due_date` 列追加 SQL |
| `web/src/app/page.tsx` | 型・取得・追加・一覧更新 |
| `web/src/components/TodoItem.tsx` | 期限入力 UI |
| `web/src/components/TodoItem.test.tsx` | 期限テスト 3 本追加 |
| `web/e2e/todo.spec.ts` | 期限の E2E 検証 |

---

## §1. ブランチを切る

開発コンテナ内で作業する。

```bash
cd /workspace
git switch -c feat/todo-due-date
```

- スキーマ・アプリ・テストは **1 つの PR** にまとめる（CI の `e2e` が migration とコードの整合を一度に検証するため）
- コミットは **2 本**に分ける（機能と UI を切り分けてレビューしやすくする）

---

## §2. マイグレーションを追加する

```bash
cd /workspace
supabase migration new add_due_date_to_todos
```

生成された `supabase/migrations/<timestamp>_add_due_date_to_todos.sql` に次を書く。

```sql
alter table public.todos
  add column if not exists due_date date;
```

- **RLS は変更不要**（行の所有者制御なので、列追加の影響を受けない）
- ローカルで適用して確認する

```bash
supabase db reset
```

エラーなく完了すればスキーマ変更は OK。

---

## §3. 機能を実装する

フェーズ3 §10 の `page.tsx` / `TodoItem.tsx` をベースに、`due_date` の入力（追加フォーム）と編集（一覧）を足す。

### 3.1 `page.tsx` — 型・state・取得

`Todo` 型に `due_date` を追加する。

```tsx
type Todo = {
  id: string;
  title: string;
  is_done: boolean;
  due_date: string | null;
};
```

`load` の `select` に `due_date` を含める。

```tsx
  const load = useCallback(async () => {
    const { data } = await supabase
      .from("todos")
      .select("id, title, is_done, due_date")
      .order("created_at", { ascending: false });
    setTodos(data ?? []);
  }, []);
```

期限用 state を追加する。

```tsx
  const [dueDate, setDueDate] = useState("");
```

`addTodo` で `due_date` を保存する。

```tsx
  async function addTodo(e: React.FormEvent) {
    e.preventDefault();
    const value = title.trim();
    if (!value) return;
    await supabase.from("todos").insert({ title: value, due_date: dueDate || null });
    setTitle("");
    setDueDate("");
    await load();
  }
```

一覧で期限を更新する関数を追加する。

```tsx
  async function updateDueDate(id: string, nextDueDate: string | null) {
    await supabase.from("todos").update({ due_date: nextDueDate }).eq("id", id);
    await load();
  }
```

### 3.2 `page.tsx` — 追加フォーム（1 本目コミット時点）

1 本目では横並びフォームのまま日付入力を足す。既存の `inputClassName` / `primaryButtonClassName` を使う。

```tsx
      <form className="mb-6 flex flex-wrap gap-2" onSubmit={addTodo}>
        <input
          className={inputClassName}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="やること"
          aria-label="やること"
        />
        <input
          className={inputClassName}
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          aria-label="期限"
        />
        <button type="submit" className={primaryButtonClassName}>
          追加
        </button>
      </form>
```

一覧の `TodoItem` に props を渡す。

```tsx
            <TodoItem
              id={todo.id}
              title={todo.title}
              isDone={todo.is_done}
              dueDate={todo.due_date}
              onToggle={toggle}
              onDueDateChange={updateDueDate}
            />
```

### 3.3 `TodoItem.tsx` — 一覧で期限を編集

チェックボックス用 `<label>` と期限入力は分け、日付変更が完了切り替えに干渉しないようにする。

```tsx
type TodoItemProps = {
  id: string;
  title: string;
  isDone: boolean;
  dueDate?: string | null;
  onToggle: (id: string, nextDone: boolean) => void;
  onDueDateChange: (id: string, nextDueDate: string | null) => void;
};

export function TodoItem({
  id,
  title,
  isDone,
  dueDate,
  onToggle,
  onDueDateChange,
}: TodoItemProps) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 accent-blue-600"
          checked={isDone}
          aria-label={`${title} の完了状態`}
          onChange={(e) => onToggle(id, e.currentTarget.checked)}
        />
        <span
          className={
            isDone
              ? "text-neutral-500 line-through dark:text-neutral-400"
              : "break-words"
          }
        >
          {title}
        </span>
      </label>
      <label className="flex shrink-0 items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-400">
        期限:
        <input
          type="date"
          className="shrink-0 rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800"
          value={dueDate ?? ""}
          aria-label={`${title} の期限`}
          onChange={(e) => onDueDateChange(id, e.currentTarget.value || null)}
        />
      </label>
    </div>
  );
}
```

- 期限未設定の ToDo は空の日付入力を表示する（一覧から期限を追加できる）
- 入力を空にすると `due_date` は `null` になる

### 3.4 動作確認（`pnpm run dev`）

§3 の実装が終わったら、テストを書く前に **開発サーバーで目視確認**する。UI のつながりや DB 連携のミスを、テスト作成前に早めに見つけられる。

```bash
cd /workspace
supabase start          # 止まっていれば起動
supabase db reset       # §2 の migration を DB に当てる
```

```bash
cd /workspace/web
pnpm run dev
```

ブラウザで `http://127.0.0.1:3000` を開き、次を確認する。

- ログインできる
- 「やること」と期限を入力して ToDo を追加できる
- 一覧の各行に **「期限:」** 付き日付入力がある
- 日付を変更すると反映される（再読み込み後も保持）
- 日付を空にすると期限なしになる

問題があれば §3 に戻って修正する。確認後は `Ctrl+C` で dev を止め、§4 のテスト更新に進む。

---

## §4. テストを更新する

### 4.1 ユニットテスト（`TodoItem.test.tsx`）

フェーズ4 §3.3 の `TodoItem.test.tsx` をベースに、次の **3 点**を順に反映する。`describe` ブロック・`userEvent`・Vitest の import は **そのまま残す**（合計 **5 本**の `it`）。

#### 4.1.1 `fireEvent` の追加

フェーズ4 §3.3 の Testing Library の import に `fireEvent` を足す。

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TodoItem } from "./TodoItem";
```

#### 4.1.2 既存テストの `render` に `onDueDateChange` を追加

`describe("TodoItem", () => { ... })` 内の既存 2 本それぞれの `<TodoItem>` に `onDueDateChange={() => {}}` を足す。

```tsx
describe("TodoItem", () => {
  it("タイトルが表示される", () => {
    render(
      <TodoItem
        id="todo-1"
        title="牛乳を買う"
        isDone={false}
        onToggle={() => {}}
        onDueDateChange={() => {}}
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
        onDueDateChange={() => {}}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: "牛乳を買う の完了状態" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("todo-1", true);
  });
```

#### 4.1.3 期限のテストを追加

上記 2 本の直後、同じ `describe` ブロック内に次の 3 本を追加する。日付入力の値変更は `fireEvent.change` を使う（`<input type="date">` 向け）。

```tsx
  it("期限があるとき入力に値が入る", () => {
    render(
      <TodoItem
        id="todo-1"
        title="牛乳を買う"
        isDone={false}
        dueDate="2099-12-31"
        onToggle={() => {}}
        onDueDateChange={() => {}}
      />
    );

    expect(screen.getByLabelText("牛乳を買う の期限")).toHaveValue("2099-12-31");
  });

  it("期限がないとき入力は空", () => {
    render(
      <TodoItem
        id="todo-1"
        title="牛乳を買う"
        isDone={false}
        dueDate={null}
        onToggle={() => {}}
        onDueDateChange={() => {}}
      />
    );

    expect(screen.getByLabelText("牛乳を買う の期限")).toHaveValue("");
  });

  it("期限変更時に onDueDateChange が呼ばれる", () => {
    const onDueDateChange = vi.fn();

    render(
      <TodoItem
        id="todo-1"
        title="牛乳を買う"
        isDone={false}
        dueDate="2099-12-31"
        onToggle={() => {}}
        onDueDateChange={onDueDateChange}
      />
    );

    fireEvent.change(screen.getByLabelText("牛乳を買う の期限"), {
      target: { value: "2099-01-15" },
    });

    expect(onDueDateChange).toHaveBeenCalledTimes(1);
    expect(onDueDateChange).toHaveBeenCalledWith("todo-1", "2099-01-15");
  });
});
```

### 4.2 E2E（`web/e2e/todo.spec.ts`）

ToDo 追加の前後に、期限の入力と表示確認を足す。

```tsx
  const due = "2099-12-31";

  await page.getByLabel("やること").fill(title);
  await page.getByLabel("期限").fill(due);
  await page.getByRole("button", { name: "追加" }).click();
  await expect(page.getByText(title)).toBeVisible();
  await expect(page.getByLabel(`${title} の期限`)).toHaveValue(due);
```

- `getByLabel(\`${title} の期限\`)` は `TodoItem` の `aria-label` と揃える
- `getByLabel("やること")` / `getByLabel("期限")` は §3.2 の `aria-label` でも §6 の `<label>` でも同じセレクタで動く

---

## §5. 1 本目をコミットする

### 5.1 確認

§3.4 で目視確認済みでも、§4 のテスト更新後は改めて確認する。必要なら §3.4 と同様に `pnpm run dev` でブラウザ確認を行い、`Ctrl+C` で止める。

品質ゲートを実行する。念のため、E2E の前にローカル DBを初期化しておく。

```bash
cd /workspace
supabase start          # 止まっていれば起動
supabase db reset       # 全 migration を当て直す
```

```bash
cd /workspace/web
pnpm run lint
pnpm run typecheck
pnpm run test    # 5 本
pnpm run build
pnpm run e2e
```

### 5.2 コミット

修正をコミットする。

```bash
cd /workspace
git add supabase/migrations \
        web/src/app/page.tsx \
        web/src/components/TodoItem.tsx \
        web/src/components/TodoItem.test.tsx \
        web/e2e/todo.spec.ts
git commit -m "feat: add due_date to todos"
```

push は §7 まで待つ。

---

## §6. フォーム UI を改善する（2 本目コミット）

§3.2 の横並びフォームだけだと、`type="date"` に `placeholder` が効かず用途が分かりにくい。ラベル・枠・右下の「追加」ボタンでフォーム全体の意味を明確にする。

`page.tsx` に class 定数を追加する。

```tsx
const fieldLabelClassName =
  "flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-400";

const formPanelClassName =
  "mb-6 rounded-md border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900";
```

§3.2 の `<form>` を次に差し替える。

```tsx
      <form className={formPanelClassName} onSubmit={addTodo}>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className={fieldLabelClassName}>
            やること
            <input
              className={`${inputClassName} w-full`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className={`${fieldLabelClassName} sm:min-w-[10rem]`}>
            期限
            <input
              className={`${inputClassName} w-full`}
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <button type="submit" className={primaryButtonClassName}>
            追加
          </button>
        </div>
      </form>
```

### 6.1 確認 → コミット

§5 と同様に `pnpm run dev` → 品質ゲート → `pnpm run e2e` を実行する。

```bash
cd /workspace
git add web/src/app/page.tsx
git commit -m "style: improve todo form layout and labels"
```

push は §7 まで待つ。

---

## §7. PR を作成して CI を確認する

```bash
cd /workspace
git push -u origin feat/todo-due-date
```

GitHub で Pull request を作成（base: `main`）。

**CI が検証すること**

| ジョブ | 内容 |
|--------|------|
| `quality` | lint / typecheck / test / build |
| `e2e` | ランナー内 Supabase に PR の migration を当てた DB で Playwright 実行 |

- コードが `due_date` を参照し、migration が列を追加している — 両方が PR 内で整合しているか CI が自動確認する
- migration 漏れがあれば `column "due_date" does not exist` で **e2e が落ちる**

---

## §8. Preview で確認する

Vercel Preview はクラウド Supabase を参照する。Preview で期限機能を試す前に、**クラウド DB へ migration を適用**する。

```bash
cd /workspace
supabase db push
```

- `due_date` は NULL 許容の追加列なので、**先に DB に当てても旧コードは壊れない**（expand）
- 標準構成では Preview と Production が **同じ Supabase** を見る（フェーズ5 §6.3 参照）
- Preview URL でログイン → 期限付き ToDo の追加・編集を目視確認する

> スキーマ整合の自動ゲートは CI の `e2e` が担う。Preview は UI の目視確認用と割り切る。

---

## §9. マージして本番を更新する

1. レビュー後、PR を **Merge** する
2. `main` への反映で **Vercel が Production を自動デプロイ**する
3. 本番 DB に migration が当たっていることを確認する（§8 で `supabase db push` 済み、またはこのタイミングで実行）

**反映順序（expand 型の変更）**

```
supabase db push（DB に列を追加）
    ↓
main マージ（Vercel Production デプロイ）
```

NULL 許容列の追加は旧コードに無害。列削除や NOT NULL 化など後方非互換の変更は、本フェーズの題材から外す。

---

## §10. リリースタグを切る（任意）

```bash
cd /workspace
git switch main
git pull
git tag v0.2.0 -m "Add due_date to todos"
git push origin v0.2.0
```

GitHub Releases から変更点（期限の追加）を記録しておく。

---

## §11. CI を育てる（任意）

一周を見届けたら、CI を速く・安定させる。`quality` / `e2e` 本体とブランチ保護はフェーズ4で済んでいるので、ここでは**追加の最適化**だけを行う。

### 11.1 Playwright ブラウザのキャッシュ

```yaml
      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: pw-${{ runner.os }}-${{ hashFiles('web/pnpm-lock.yaml') }}
```

### 11.2 ツールバージョンの固定

| 対象 | 固定する場所 | 揃える相手 |
|------|--------------|-----------|
| Node | `actions/setup-node` の `node-version` | `.devcontainer/Dockerfile` / `.nvmrc` |
| pnpm | `pnpm/action-setup` の `version` | Dockerfile の `corepack prepare` |
| Supabase CLI | `supabase/setup-cli` の `version` | 開発コンテナの CLI |

### 11.3 同時実行のキャンセル

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

### 11.4 夜間 E2E（将来）

スイートが増えたら、PR 必須はスモーク 1 本のまま、全量 E2E を `schedule` ワークフローに分離する。

---

## よくある失敗

| 症状 | 原因と対処 |
|------|-----------|
| E2E が `column does not exist` | migration 漏れ。§2 の SQL を PR に含める |
| Preview / 本番で列エラー | `supabase db push` 未実行 |
| ローカルだけ動く | `supabase db reset` で migration 適用を確認 |
| 列名不一致 | SQL の `due_date` と `select("... due_date")` を揃える |

---

## 完了チェックリスト

- [ ] `feat/todo-due-date` ブランチで作業した
- [ ] `supabase/migrations` に `due_date` 追加 SQL がある
- [ ] 追加フォームで期限を入力でき、一覧で期限を編集できる
- [ ] §6 のフォーム UI（ラベル・枠・右下ボタン）を整えた
- [ ] ユニットテスト 5 本・E2E に期限検証がある
- [ ] 各コミット前に品質ゲート + E2E が緑
- [ ] 2 コミットを 1 PR に載せ、CI（`quality` / `e2e`）が緑
- [ ] `supabase db push` 済み
- [ ] Preview / Production で期限機能が動く
- [ ] （任意）`v0.2.0` タグ / Release
- [ ] （任意）§11 で CI 最適化

---

フェーズ6完了後は、同じループ（**ブランチ → テスト → PR → CI → Preview → マージ → 本番**）で機能を増やしていく。
