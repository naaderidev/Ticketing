import { render, screen } from "@testing-library/react";
import HomePage from "@/app/page";
import demoAccounts from "@/config/demo-accounts.json";

describe("HomePage demo accounts", () => {
  it("renders all documented and operational personas in twelve cards", () => {
    render(<HomePage />);

    expect(screen.getAllByRole("article")).toHaveLength(12);
    for (const roleTitle of [
      "مدیر سامانه",
      "مدیر پشتیبانی",
      "سرپرست پشتیبانی",
      "کارشناس پشتیبانی",
      "مدیر حساب سازمانی",
      "ممیز",
      "کارشناس گزارش",
      "مدیر شرکت",
      "نماینده شرکت",
      "کاربر فردی",
    ]) {
      expect(screen.getAllByText(roleTitle).length).toBeGreaterThan(0);
    }
  });

  it("hides credentials and offers direct login for every account", () => {
    render(<HomePage />);

    expect(screen.queryByText("09120000001")).not.toBeInTheDocument();
    expect(screen.queryByText("Demo@12345678")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "ورود مستقیم با حساب مدیر ۱" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ورود مستقیم با حساب امید علوی" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ورود مستقیم با حساب زهرا رضایی" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /ورود مستقیم با حساب/ })).toHaveLength(12);
  });

  it("keeps all demo identifiers unique", () => {
    expect(new Set(demoAccounts.map((account) => account.mobile)).size).toBe(12);
    expect(new Set(demoAccounts.map((account) => account.key)).size).toBe(12);
    expect(new Set(demoAccounts.map((account) => account.nationalCode)).size).toBe(12);
    expect(new Set(demoAccounts.map((account) => account.email)).size).toBe(12);
  });
});
