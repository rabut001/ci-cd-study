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