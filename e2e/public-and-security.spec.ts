import { expect, test } from "@playwright/test";

test("landing page is RTL and logs directly into the selected customer", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("تیکتِ‌تو");
  await expect(page.locator("html")).toHaveAttribute("lang", "fa");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { name: /به سیستم .* خوش آمدید/ })
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(12);

  await page
    .getByRole("button", {
      name: "ورود مستقیم با حساب مشتری ۱",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/user$/);
  await expect(page).not.toHaveURL(/\/user\/login/);

  await page.getByRole("button", { name: "خروج", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "حساب‌های آماده ورود" }),
  ).toBeVisible();
});

test("protected pages redirect unauthenticated users with a local return path", async ({
  page,
}) => {
  await page.goto("/user");

  await expect(page).toHaveURL(/\/user\/login\?redirect=%2Fuser$/);
});

test("admin login performs a fresh document navigation after authentication", async ({
  page,
}) => {
  await page.goto("/user/login?redirect=%2Fadmin%2Fworkspace");

  await page.route("**/api/users/login", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 1,
        firstName: "مدیر",
        lastName: "آزمایشی",
        mobile: "09121234567",
        role: "ADMIN",
      }),
    })
  );
  await page.route("**/admin/workspace", (route) => {
    if (route.request().resourceType() !== "document") {
      return route.fallback();
    }

    return route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: "<html lang=\"fa\" dir=\"rtl\"><body><h1>فضای کاری پشتیبانی</h1></body></html>",
    });
  });

  await page.locator("#mobile").fill("09121234567");
  await page.locator("#password").fill("valid-password");
  await page.getByRole("button", { name: "ورود" }).click();

  await expect(page).toHaveURL(/\/admin\/workspace$/);
  await expect(
    page.getByRole("heading", { name: "فضای کاری پشتیبانی" })
  ).toBeVisible();
});

test("login form rejects invalid client input without a network mutation", async ({ page }) => {
  let loginRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/users/login")) loginRequests += 1;
  });

  await page.goto("/user/login");
  await page.locator("#mobile").fill("123");
  await page.getByRole("button", { name: "ورود" }).click();

  await expect(page.getByText("شماره موبایل معتبر نیست (مثال: 09121234567)")).toBeVisible();
  await expect(page.getByText("رمز عبور الزامی است")).toBeVisible();
  expect(loginRequests).toBe(0);
});

test("mutation boundary distinguishes authentication from cross-origin rejection", async ({
  request,
  baseURL,
}) => {
  const sameOrigin = await request.post("/api/tickets", {
    headers: { Origin: baseURL! },
    data: {},
  });
  expect(sameOrigin.status()).toBe(401);

  const crossOrigin = await request.post("/api/tickets", {
    headers: {
      Origin: "https://attacker.example",
      "Sec-Fetch-Site": "cross-site",
    },
    data: {},
  });
  expect(crossOrigin.status()).toBe(403);
  await expect(crossOrigin.json()).resolves.toMatchObject({ code: "CSRF_FAILED" });
});

test("public responses include the required browser security headers", async ({ request }) => {
  const requestId = "123e4567-e89b-42d3-a456-426614174000";
  const response = await request.get("/", { headers: { "x-request-id": requestId } });

  expect(response.headers()["x-request-id"]).toBe(requestId);
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
});
