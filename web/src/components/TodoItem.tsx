type TodoItemProps = {
  id: string;
  title: string;
  isDone: boolean;
  onToggle: (id: string, nextDone: boolean) => void;
};

export function TodoItem({ id, title, isDone, onToggle }: TodoItemProps) {
  return (
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
  );
}
