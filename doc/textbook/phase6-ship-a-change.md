# フェーズ6：「修正してリリース」を一周する（ToDo に期限 Due date を追加）＋ CI を育てる — 具体手順

**前提（フェーズ1〜5まで完了していること）**

- ローカルで `supabase start` / `pnpm run dev` が動き、`lint` / `typecheck` / `test` / `e2e` が通る。
- `.github/workflows/ci.yml` に `quality` と `e2e` があり、PR で必須ゲートになっている（フェーズ4）。`e2e` は CI ランナー内で `supabase start` し、PR の migration を当てた DB に向けて Playwright を実行する。
- Vercel の Production / Preview が動き、クラウド Supabase に `todos` が載っている（フェーズ5）。

**レイアウトの前提**

- Git の管理対象はルート **`/workspace`**、アプリは **`/workspace/web`**、Supabase は **`/workspace/supabase`**。

**このフェーズのゴール**

- **1 つの機能変更**（`todos` に期限 `due_date` を追加）を、**ブランチ → マイグレーション → 実装 → テスト更新 → ローカル確認 → PR → CI → Preview → マージ → 本番反映 → タグ付け**まで通す。
- **マイグレーションを伴う変更**が、**CI の `e2e` ジョブ**（ランナー内 Supabase に PR の migration を当てて E2E）で**自動検証**されることを体感する。
- 一周を見届けたうえで、**CI を速く・安定・安全に「育てる」**（§10）。

> 題材は「期限 `due_date`（日付のみ）の追加」。**NULL 許容の列追加**なので前方互換で、安全にリリースの練習ができる。CI / CD の整理・最適化（キャッシュ、同時実行制御、夜間 E2E など）は、実際に一周を見てから §10 でまとめて行う。

---

## 1. ブランチを切る

開発コンテナ内・`/workspace` で作業する。

```bash
cd /workspace
git switch -c feat/todo-due-date
```

- 変更は「**スキーマ（migration）＋アプリ＋テスト**」をまとめて 1 つの PR にする。スキーマとコードが同じ PR にあることで、**CI の `e2e` ジョブ**が両者の整合を一度に検証できる。

---

## 2. マイグレーションを追加する（`due_date` 列）

```bash
cd /workspace
supabase migration new add_due_date_to_todos
```

生成された `supabase/migrations/<timestamp>_add_due_date_to_todos.sql` に、**NULL 許容の列追加**だけを書く。

```sql
alter table public.todos
  add column if not exists due_date date;
```

- **RLS は変更不要**。ポリシーは「行の所有者か」を見るもので、列の増減には影響しない（`auth.uid() = user_id` のまま全列に効く）。
- ローカル DB に適用して確認する。

```bash
supabase db reset
```

- `db reset` は空 DB に**全マイグレーション**（既存 + 今回の追加）を当て直す。エラーが出なければスキーマ変更は成功。

---

## 3. フロントエンドを実装する（最小）

フェーズ3 §10 の **`web/src/app/page.tsx`**（Tailwind 付き）を前提に、`due_date` の**入力**と**表示**を足す。差分は次の 4 点。

### 3.1 型と取得列に `due_date` を加える

```tsx
type Todo = {
  id: string;
  title: string;
  is_done: boolean;
  due_date: string | null;
};
```

```tsx
  const load = useCallback(async () => {
    const { data } = await supabase
      .from("todos")
      .select("id, title, is_done, due_date")
      .order("created_at", { ascending: false });
    setTodos(data ?? []);
  }, []);
```

### 3.2 入力用の state と、追加時の値を加える

既存の `title` state の直下に `dueDate` を足す。

```tsx
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
```

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

### 3.3 フォームに日付入力を足す

既存フォームの `className`（`mb-6 flex gap-2`）は維持し、**`inputClassName` / `primaryButtonClassName`**（フェーズ3 §10 で定義済み）をそのまま使う。

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

### 3.4 一覧に期限を表示する

既存の `<li className="flex items-center ...">` 内、`TodoItem` と削除ボタンの間に期限表示を足す。

```tsx
          <li
            key={todo.id}
            className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <TodoItem
              id={todo.id}
              title={todo.title}
              isDone={todo.is_done}
              onToggle={toggle}
            />
            {todo.due_date && (
              <span className="shrink-0 text-sm text-neutral-600 dark:text-neutral-400">
                （期限: {todo.due_date}）
              </span>
            )}
            <button
              type="button"
              className="shrink-0 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
              onClick={() => remove(todo.id)}
              aria-label={`${todo.title} を削除`}
            >
              削除
            </button>
          </li>
```

- 表示は一覧の `li` 側に置き、`TodoItem`（表示専用コンポーネント）はそのままにする → **`TodoItem` の単体テストは変更不要**。
- もし `TodoItem` 自体に期限を表示させるなら、**そのときは `TodoItem.test.tsx` も更新**する（テストは実装と一緒に直す）。

---

## 4. テストを更新する（E2E スモークに期限を組み込む）

`web/e2e/todo.spec.ts` の「追加」前後に、**期限の入力と表示の確認**を足す。

```tsx
  const due = "2099-12-31";

  await page.getByLabel("やること").fill(title);
  await page.getByLabel("期限").fill(due);
  await page.getByRole("button", { name: "追加" }).click();
  await expect(page.getByText(title)).toBeVisible();
  await expect(page.getByText(`期限: ${due}`)).toBeVisible();
```

- メール / パスワード認証なので、E2E はフォーム操作だけで完結する（フェーズ4 §5 の構成のまま）。
- ユニットテストは、上記のとおり `TodoItem` を変えていなければ追加不要。ロジックを切り出した場合はそこに 1 本足す。

---

## 5. ローカルで一周させる（PR 前）

開発コンテナ内で、**CI と同じ並び**で通す。

```bash
# 1) スキーマを適用した DB を用意
cd /workspace
supabase start
supabase db reset

# 2) 品質ゲート（web）
cd /workspace/web
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build

# 3) E2E スモーク（webServer が build→start を行う）
pnpm run e2e
```

- すべて緑なら、PR を出す準備ができている。`pnpm run dev` で実際に画面から期限を入れて表示も目視確認しておくとなおよい。

---

## 6. コミットして PR を開く

```bash
cd /workspace
git add supabase/migrations web/src/app/page.tsx web/e2e/todo.spec.ts
git commit -m "feat: add due_date to todos"
git push -u origin feat/todo-due-date
```

GitHub で **Pull request** を作成（base: `main`）。

- PR で **`ci.yml` が起動**する。`quality` の後に `e2e` が走り、**`e2e` はランナー内 Supabase に「今回の migration を含む全マイグレーション」を当てた DB**に対して実行される。
- つまり「**列を追加するコード**」と「**列を追加する migration**」が**同じ PR の中で噛み合っているか**を CI が自動で確かめる。ここが **ランナー内 Supabase 向け E2E**（フェーズ4 §5・§6）の利点。
- もし migration を入れ忘れてコードだけ変えていたら、`e2e` は `column "due_date" does not exist` 系で**落ちる**（=事故を PR で止められる）。

---

## 7. Preview で確認する（クラウド側の migration 適用に注意）

Vercel の **Preview** デプロイは、PR のコードを**Preview 用の環境変数で決まった Supabase**に向けて動かす。標準構成では**全 Preview が同じ（共有の）Supabase**を見る（詳細はフェーズ5 §6.3 の注記）。

そのため、**Preview で期限機能を確認するには、その Supabase に migration を当てておく**必要がある。

```bash
cd /workspace
# リンク済みプロジェクトに未適用のマイグレーションを反映（フェーズ5 §2 参照）
supabase db push
```

- `due_date` は **NULL 許容の追加列**なので前方互換。**先に DB に当てても既存（旧コード）は壊れない**（expand 型の変更）。
- 共有 Supabase に当てると、他の Preview や `main` 用デプロイにも同じ列が見える点に留意する。**PR ごとに隔離したい場合は Supabase Branching（Pro・有料）**が必要（フェーズ5 §6.3）。
- Preview URL でログイン → 期限を入れて追加 → 一覧に「期限: …」が出れば OK。

> スキーマ整合の**自動ゲート**は §6 の **`e2e` ジョブ**が担う。Preview は**人による UI 目視確認**と割り切ると、無料運用のまま安全に回せる。

---

## 8. マージして本番を更新する

1. レビュー（自分でも可）後、PR を **Merge** する。
2. `main` への反映で **Vercel が Production を自動デプロイ**する。
3. 本番 DB に migration が当たっていることを確認する（§7 で `supabase db push` 済み、または本番反映のタイミングで実行）。

**順序の原則（前方互換の追加変更）**:

- **DB を先に（expand）→ コードを後で**。NULL 許容列の追加は旧コードに無害なので、`db push` を先に済ませてから本番デプロイすると安全。
- 列削除や NOT NULL 化など**後方非互換**の変更は、本フェーズの題材から外す（段階適用やバックフィルが必要で、別途設計する）。

---

## 9. リリースのタグを切る（任意）

「どの変更が本番に出たか」を残すと運用が楽になる。

```bash
cd /workspace
git switch main
git pull
git tag v0.2.0 -m "Add due_date to todos"
git push origin v0.2.0
```

- GitHub の **Releases** から `v0.2.0` を作成し、変更点（期限の追加）を書いておく。
- 次の機能では `v0.3.0` のように上げていく。

---

## 10. 発展：CI を育てる（最適化・任意）

一周を見届けたら、CI を**速く・安定・安全**に育てる。`ci.yml` 本体（`quality` / `e2e`）と**ブランチ保護（必須チェック）は フェーズ4（§6・§7）** にあるので、ここでは**重複しない最適化**だけを足す。

### 10.1 依存キャッシュ

- **pnpm**：`actions/setup-node` の `cache: "pnpm"` と `cache-dependency-path: web/pnpm-lock.yaml` は導入済み（フェーズ4）。
- **Playwright ブラウザ**：`e2e` で毎回ダウンロードすると遅い。`~/.cache/ms-playwright` をキャッシュすると 2 回目以降が速い。

```yaml
      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: pw-${{ runner.os }}-${{ hashFiles('web/pnpm-lock.yaml') }}

      - name: Install Playwright browser
        working-directory: web
        run: pnpm exec playwright install --with-deps chromium
```

- `--with-deps` は OS ライブラリ導入のため残す（apt は毎回走るが軽い）。ブラウザ本体がキャッシュ済みならダウンロードを省略する。

### 10.2 バージョンを固定して「ローカル＝CI」を保つ

| 対象 | 固定する場所 | 揃える相手 |
|------|--------------|-----------|
| Node メジャー | `actions/setup-node` の `node-version` | `Dockerfile` の `FROM` / `web/.nvmrc` |
| pnpm | `pnpm/action-setup` の `version` | `Dockerfile` の `corepack prepare pnpm@9` |
| Supabase CLI | `supabase/setup-cli` の `version` | `Dockerfile` で入れた CLI のバージョン |

- 特に **Supabase CLI** は `config.toml` のスキーマと結びつくため、`latest` だと「未知のフィールド」エラーが出ることがある。**明示バージョン**にする。

### 10.3 `e2e` ジョブを速く・安定させる

**Supabase の最小構成**（不要サービスの無効化）は **フェーズ2 §4.2** で `supabase/config.toml` に設定済みのはずである。CI でも同じ `config.toml` が使われるため、ローカルと同様 **Auth + REST + DB** だけが立ち上がる。

ここでは CI 向けの追加施策を載せる。

- **Supabase CLI のバージョン固定**（**§10.2**）：`config.toml` のスキーマと食い違うと `supabase start` が失敗する。`supabase/setup-cli` の `version` を開発コンテナの CLI と揃える。
- **イメージ取得のレート制限**：初回の `supabase start` は pull が重く、`toomanyrequests` で落ちることがある。§4.2 の最小構成で pull 数は既に減っている。それでも足りなければ、ランナー側の Docker レイヤーキャッシュや再実行間隔の調整を検討する。
- **将来 Storage / Realtime を使う場合**：フェーズ2 §4.2 で無効化したサービスを `enabled = true` に戻すと、pull と起動時間が増える点に注意する。

### 10.4 同時実行をキャンセルする

同じブランチへの連続 push で古い実行を止め、待ち時間とランナー消費を減らす。`ci.yml` のトップレベルに置く。

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

### 10.5 （発展）E2E の段階運用

スイートが育ったら**重いものを分離**する。**PR / `main` はスモーク 1 本を必須**に保ち、**全量 E2E は夜間**に回す（非必須でよい）。

```yaml
# .github/workflows/e2e-nightly.yml（例）
name: e2e-nightly
on:
  schedule:
    - cron: "0 15 * * *" # 毎日 00:00 JST（UTC 15:00）
jobs:
  e2e-full:
    runs-on: ubuntu-latest
    steps:
      # ci.yml の e2e ジョブと同様に supabase start → playwright test（全量）
      - run: echo "ここに全量 E2E を置く"
```

### 10.6 （任意）開発イメージと CI を揃える

ホストと CI の差をさらに減らすなら、フェーズ2の **`.devcontainer/Dockerfile` を CI でも `docker build`** して使う、または `container:` に同等イメージを指定する。最初は `setup-node` ベースで十分。

---

## よくある失敗ポイント

- **migration 入れ忘れ**：コードだけ `due_date` を使い、migration を書いていない → PR の `e2e` が `column does not exist` で落ちる（正しく検知できている）。
- **クラウド未適用**：Preview / 本番で 500 / 列エラー → `supabase db push` で当てたか確認（フェーズ5 §2）。
- **共有 Supabase の取り違え**：Preview が本番と同じ DB を見ていることを忘れ、破壊的操作をする → 追加列は無害だが、テストデータの削除などは控える。
- **列名・型のタイポ**：`select("... , due_date")` と SQL の列名が不一致 → ローカル `supabase db reset` → `pnpm run e2e` で早期に気づく。
- **後方非互換の変更を軽い気持ちで入れる**：NOT NULL 列の追加や列削除は旧コード / 既存データを壊す → 本フェーズの題材（NULL 許容追加）に留める。
- **CI 最適化のやりすぎ**：フェーズ2 §4.2 で止めたサービス以外まで `config.toml` で無効化する、`concurrency` で `main` の実行までキャンセルする等 → 最小から少しずつ。

---

## フェーズ6の完了チェックリスト

- [ ] `feat/todo-due-date` ブランチで作業した。
- [ ] `supabase/migrations` に `due_date` 追加の SQL があり、`supabase db reset` で適用できる。
- [ ] `web/src/app/page.tsx` で期限の入力と表示ができる（RLS は変更不要）。
- [ ] `web/e2e/todo.spec.ts` に期限の入力・表示の確認を追加した。
- [ ] ローカルで `lint` / `typecheck` / `test` / `build` / `e2e` が緑。
- [ ] PR で `quality` と `e2e` が緑（migration とコードの整合を CI が確認）。
- [ ] Preview / 本番に `supabase db push` で migration を当て、期限機能が表示される。
- [ ]（任意）`v0.2.0` のタグ / Release を作成した。
- [ ]（任意・§10）キャッシュ / バージョン固定 / `concurrency` などで CI を最適化した。

これで「**ブランチ → CI → Preview → マージ → 本番 → タグ**」の一周を、**マイグレーションを伴う実機能**で体験できた。以降は、テストを増やす・機能を厚くする作業を、同じループに乗せて回していく。
