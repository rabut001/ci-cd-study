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

const inputClassName =
  "min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-base dark:border-neutral-600 dark:bg-neutral-800";

const primaryButtonClassName =
  "rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700";

const secondaryButtonClassName =
  "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700";

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
      <main className="mx-auto max-w-lg p-6">
        <p className="text-neutral-600 dark:text-neutral-400">読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg p-6">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">ToDo</h1>
        <button type="button" className={secondaryButtonClassName} onClick={signOut}>
          ログアウト
        </button>
      </header>

      <form className="mb-6 flex gap-2" onSubmit={addTodo}>
        <input
          className={inputClassName}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="やること"
          aria-label="やること"
        />
        <button type="submit" className={primaryButtonClassName}>
          追加
        </button>
      </form>

      <ul className="flex flex-col gap-2">
        {todos.map((todo) => (
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
            <button
              type="button"
              className="shrink-0 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
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
