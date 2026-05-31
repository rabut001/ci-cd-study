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