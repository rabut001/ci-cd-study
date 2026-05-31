import { fireEvent, render, screen } from "@testing-library/react";
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