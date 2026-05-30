"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

const inputClassName =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base dark:border-neutral-600 dark:bg-neutral-800";

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
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">ログイン</h1>
      <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900">
        <input
          className={inputClassName}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email"
          aria-label="email"
        />
        <input
          className={inputClassName}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          aria-label="password"
        />
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            className="flex-1 rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
            onClick={signIn}
          >
            ログイン
          </button>
          <button
            type="button"
            className="flex-1 rounded-md border border-neutral-300 bg-white px-4 py-2 font-medium hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700"
            onClick={signUp}
          >
            サインアップ
          </button>
        </div>
      </div>
      {message && (
        <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900">
          {message}
        </p>
      )}
    </main>
  );
}
