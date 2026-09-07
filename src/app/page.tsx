import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { User, Shield, Clock, CheckCircle, MessageSquare } from "lucide-react";
import Image from "next/image";
import { labels } from "@/lib/strings";

export default function HomePage() {
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
            />
          <p className="text-sm text-muted-foreground">
            سیستم پشتیبانی و مدیریت تیکت
          </p>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center bg-linear-to-b from-muted/40 to-background p-4">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight">
            به سیستم <span className="text-indigo-600">تیکتِ‌تو</span>{" "}
            خوش آمدید
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            برای دسترسی به بخش مورد نظر خود، یکی از گزینه‌های زیر را انتخاب کنید
          </p>
        </div>

        <div className="grid w-full max-w-4xl gap-8 md:grid-cols-2">
          <Link href="/user/login" className="group block cursor-pointer">
            <Card className="h-full transition-all duration-300 hover:shadow-xl hover:scale-[1.02] hover:border-indigo-600 border">
              <CardHeader className="text-center pb-4">
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-indigo-600 transition-colors">
                  <User className="h-10 w-10 text-white transition-transform group-hover:scale-110" />
                </div>
                <CardTitle className="text-2xl text-slate-900">
                  {labels.SIDEBAR_USER_PANEL}
                </CardTitle>
                <CardDescription className="text-base text-slate-500">
                  ایجاد و پیگیری تیکت‌های پشتیبانی
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3 text-sm">
                    <CheckCircle className="h-4 w-4 text-indigo-600 shrink-0" />
                    <span>ایجاد تیکت جدید با فلوی ساده</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm">
                    <CheckCircle className="h-4 w-4 text-indigo-600 shrink-0" />
                    <span>مشاهده لیست تیکت‌ها با فیلتر پیشرفته</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm">
                    <CheckCircle className="h-4 w-4 text-indigo-600 shrink-0" />
                    <span>پیگیری وضعیت و پاسخ‌ها</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm">
                    <CheckCircle className="h-4 w-4 text-indigo-600 shrink-0" />
                    <span>امتیازدهی به کیفیت پاسخ‌ها</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin" className="group block cursor-pointer">
            <Card className="h-full transition-all duration-300 hover:shadow-xl hover:scale-[1.02] hover:border-indigo-600 border">
              <CardHeader className="text-center pb-4">
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-indigo-600 transition-colors">
                  <Shield className="h-10 w-10 text-white transition-transform group-hover:scale-110" />
                </div>
                <CardTitle className="text-2xl text-slate-900">
                  {labels.SIDEBAR_ADMIN_PANEL}
                </CardTitle>
                <CardDescription className="text-base text-slate-500">
                  مدیریت تیکت‌ها و تنظیمات سیستم
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3 text-sm">
                    <CheckCircle className="h-4 w-4 text-indigo-600 shrink-0" />
                    <span>مدیریت دپارتمان‌ها و ساب‌دپارتمان‌ها</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm">
                    <CheckCircle className="h-4 w-4 text-indigo-600 shrink-0" />
                    <span>ایجاد و ویرایش پرسش و پاسخ متداول</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm">
                    <CheckCircle className="h-4 w-4 text-indigo-600 shrink-0" />
                    <span>پاسخ به تیکت‌ها با پیام‌های آماده</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm">
                    <CheckCircle className="h-4 w-4 text-indigo-600 shrink-0" />
                    <span>انتقال و بستن تیکت‌ها</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="mt-16 grid w-full max-w-4xl gap-6 md:grid-cols-3">
          <div className="flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Clock className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-semibold">پاسخ سریع</h3>
            <p className="text-sm text-muted-foreground">
              تیکت‌های شما در کوتاه‌ترین زمان ممکن بررسی می‌شوند
            </p>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <MessageSquare className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-semibold">ارتباط مستقیم</h3>
            <p className="text-sm text-muted-foreground">
              امکان گفتگوی مستقیم با تیم پشتیبانی
            </p>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <CheckCircle className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-semibold">پیگیری آسان</h3>
            <p className="text-sm text-muted-foreground">
              مشاهده وضعیت لحظه‌ای تیکت‌ها
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        سیستم تیکتینگ © {new Date().getFullYear()}
      </footer>
    </div>
  );
}
