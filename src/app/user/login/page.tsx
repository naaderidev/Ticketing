"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowRight, Smartphone } from "lucide-react"
import { labels, titles, descriptions, buttons, errors } from "@/lib/strings"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { loginSchema, LoginInput } from "@/lib/validations"
import { toast } from "sonner"
import { useUser } from "@/contexts/user-context"

export default function UserLoginPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const { setUser } = useUser()

  const { register, handleSubmit, formState: { errors: formErrors } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginInput) => {
    setIsLoading(true)

    try {
      const res = await fetch("/api/users/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: data.mobile }),
      })

      if (res.ok) {
        const user = await res.json()
        setUser(user)
        toast.success("ورود با موفقیت انجام شد")
        router.push("/user")
      } else {
        const result = await res.json()
        if (res.status === 404) {
          router.push(`/user/signup?mobile=${data.mobile}`)
        } else {
          toast.error(result.error || errors.LOGIN)
        }
      }
    } catch (_err) {
      toast.error(errors.SERVER_ERROR)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-muted/40 to-background p-4">
      <Link href="/" className="mb-8">
        <Button variant="ghost" size="sm">
          <ArrowRight className="ml-2 h-4 w-4" />
          {buttons.BACK}
        </Button>
      </Link>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900">
            <Smartphone className="h-8 w-8 text-white dark:text-white" />
          </div>
          <CardTitle className="text-2xl">ورود کاربر</CardTitle>
          <CardDescription>
            برای مشاهده تیکت‌های خود، شماره موبایل را وارد کنید
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mobile">{labels.LOGIN_MOBILE}</Label>
              <Input
                id="mobile"
                type="tel"
                placeholder="09121234567"
                {...register("mobile")}
                dir="ltr"
              />
              {formErrors.mobile && (
                <p className="text-destructive text-sm">{formErrors.mobile.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? "در حال ورود..." : buttons.LOGIN_BTN}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
