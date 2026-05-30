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