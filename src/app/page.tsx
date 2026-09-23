import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  ClipboardCheck,
  ContactRound,
  Headset,
  LifeBuoy,
  ShieldCheck,
  User,
  UserCog,
} from "lucide-react";
import Image from "next/image";
import demoAccounts from "@/config/demo-accounts.json";
import { DemoAccountLoginButton } from "@/components/landing/demo-account-login-button";
import { formatJalaliDate, toPersianDateDigits } from "@/lib/jalali-date";

const ACCOUNT_ICON_STYLES = [
  "bg-violet-600",
  "bg-rose-600",
  "bg-sky-700",
  "bg-teal-600",
  "bg-orange-600",
  "bg-indigo-600",
  "bg-emerald-700",
  "bg-cyan-700",
  "bg-fuchsia-700",
  "bg-blue-700",
  "bg-amber-600",
  "bg-purple-700",
] as const;

const PERSONA_ICONS = {
  SYSTEM_ADMINISTRATOR: ShieldCheck,
  SUPPORT_MANAGER: Headset,
  SUPERVISOR: UserCog,
  SUPPORT_AGENT: LifeBuoy,
  ACCOUNT_MANAGER: BriefcaseBusiness,
  AUDITOR: ClipboardCheck,
  REPORTING_EXPORTER: BarChart3,
  ORGANIZATION_MANAGER: Building2,
  ORGANIZATION_REPRESENTATIVE: ContactRound,
  INDIVIDUAL_CUSTOMER: User,
} as const;

export default function HomePage() {
  const currentJalaliYear = toPersianDateDigits(
    formatJalaliDate(new Date()).slice(0, 4),
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <Image
            src="/logo.png"
            alt="تیکتِ‌تو"
            className="h-12 w-auto"
            width={100}
            height={100}
            loading="eager"
          />
          <p className="text-sm text-muted-foreground">
            سرویس پشتیبانی آنلاین برق‌تو
          </p>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center bg-slate-50/80 px-4 py-8 dark:bg-background sm:px-6 lg:px-8">
        <div className="mb-8 max-w-3xl text-center">
          <span className="mb-2 inline-block text-xs font-bold text-primary">
            ورود سریع نسخه نمایشی
          </span>
          <h1 className="text-3xl font-black tracking-tight text-slate-950 dark:text-foreground sm:text-4xl">
            به سیستم <span className="text-indigo-600">تیکتِ‌تو</span> خوش آمدید
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate-500 dark:text-muted-foreground sm:text-base">
            این نسخه برای ارائه آماده شده است؛ با انتخاب هر حساب، مستقیم وارد
            پنل همان کاربر شوید.
          </p>
        </div>

        <section
          className="w-full max-w-[1680px]"
          aria-labelledby="demo-accounts-title"
        >
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="demo-accounts-title" className="text-xl font-semibold">
                حساب‌های آماده ورود
              </h2>
              <p className="text-sm text-muted-foreground">
                نقش‌های پشتیبانی، مدیریتی، سازمانی و مشتری با دسترسی مستقل
              </p>
            </div>
            <span className="text-xs text-muted-foreground">۱۲ حساب دمو</span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {demoAccounts.map((account, index) => {
              const AccountIcon =
                PERSONA_ICONS[
                  account.personaKey as keyof typeof PERSONA_ICONS
                ] ?? User;

              return (
                <article key={account.key}>
                  <Card
                    className="group flex h-full min-h-60 flex-col gap-0 overflow-hidden rounded-2xl border-slate-200 bg-white py-0 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg dark:border-border dark:bg-card"
                  >
                    <CardHeader className="items-center p-5 pb-3 text-center">
                      <div
                        className={`mb-2 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-sm ${ACCOUNT_ICON_STYLES[index % ACCOUNT_ICON_STYLES.length]}`}
                      >
                        <AccountIcon className="h-6 w-6" aria-hidden="true" />
                      </div>
                      <h3 className="text-base font-black text-slate-950 dark:text-foreground">
                        {account.displayName}
                      </h3>
                      <CardDescription className="text-xs">
                        {account.roleTitle}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col p-4 pt-1">
                      <p className="mb-4 min-h-12 text-center text-xs leading-6 text-slate-600 dark:text-muted-foreground">
                        {account.roleDescription}
                      </p>
                      <DemoAccountLoginButton
                        accountKey={account.key}
                        displayName={account.displayName}
                      />
                    </CardContent>
                  </Card>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        سرویس پشتیبانی آنلاین برق‌تو © {currentJalaliYear}
      </footer>
    </div>
  );
}
