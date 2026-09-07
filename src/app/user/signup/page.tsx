"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowRight, UserPlus } from "lucide-react"
import { labels, titles, buttons, errors } from "@/lib/strings"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { createUserSchema, CreateUserInput } from "@/lib/validations"
import { toast } from "sonner"
import dynamic from "next/dynamic"
import { useUser } from "@/contexts/user-context"

const DatePicker = dynamic(() => import("react-multi-date-picker"), { ssr: false })

import persian from "react-date-object/calendars/persian"
import persian_fa from "react-date-object/locales/persian_fa"

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const prefillMobile = searchParams.get("mobile") || ""
  const [isLoading, setIsLoading] = useState(false)
  const { setUser } = useUser()

  const { register, handleSubmit, control, formState: { errors: formErrors, isValid } } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    mode: "onChange",
    defaultValues: {
      mobile: prefillMobile,
    },
  })

  const onSubmit = async (data: CreateUserInput) => {
    setIsLoading(true)

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (res.ok) {
        const user = await res.json()
        setUser(user)
        toast.success("ثبت نام با موفقیت انجام شد")
        router.push("/user")
      } else {
        const result = await res.json()
        toast.error(result.error || errors.CREATE_USER)
      }
    } catch (_err) {
      toast.error(errors.SERVER_ERROR)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-muted/40 to-background p-4">
      <Link href="/user/login" className="mb-8">
        <Button variant="ghost" size="sm">
          <ArrowRight className="ml-2 h-4 w-4" />
          {buttons.BACK}
        </Button>
      </Link>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900">
            <UserPlus className="h-8 w-8 text-white dark:text-white" />
          </div>
          <CardTitle className="text-2xl">{titles.SIGNUP}</CardTitle>
          <CardDescription>
            {labels.SIGNUP_DESCRIPTION}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{labels.USER_FIRST_NAME}</Label>
                <Input
                  placeholder={labels.USER_FIRST_NAME}
                  {...register("firstName")}
                />
                {formErrors.firstName && (
                  <p className="text-destructive text-sm">{formErrors.firstName.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{labels.USER_LAST_NAME}</Label>
                <Input
                  placeholder={labels.USER_LAST_NAME}
                  {...register("lastName")}
                />
                {formErrors.lastName && (
                  <p className="text-destructive text-sm">{formErrors.lastName.message}</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{labels.USER_NATIONAL_CODE}</Label>
                <Input
                  placeholder={labels.USER_NATIONAL_CODE}
                  {...register("nationalCode")}
                  dir="ltr"
                />
                {formErrors.nationalCode && (
                  <p className="text-destructive text-sm">{formErrors.nationalCode.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{labels.USER_MOBILE}</Label>
                <Input
                  placeholder={labels.USER_MOBILE}
                  {...register("mobile")}
                  dir="ltr"
                />
                {formErrors.mobile && (
                  <p className="text-destructive text-sm">{formErrors.mobile.message}</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{labels.USER_EMAIL}</Label>
                <Input
                  placeholder={labels.USER_EMAIL}
                  {...register("email")}
                  dir="ltr"
                />
                {formErrors.email && (
                  <p className="text-destructive text-sm">{formErrors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{labels.USER_BIRTHDAY}</Label>
                <Controller
                  control={control}
                  name="birthday"
                  render={({ field }) => (
                    <DatePicker
                      containerClassName="w-full"
                      style={{ width: "100%" }}
                      inputClass="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={field.value || ""}
                      onChange={(date) => {
                        field.onChange(date && !Array.isArray(date) ? date.format("YYYY/MM/DD") : "");
                      }}
                      calendar={persian}
                      locale={persian_fa}
                      format="YYYY/MM/DD"
                      calendarPosition="bottom-right"
                      placeholder="انتخاب تاریخ تولد"
                    />
                  )}
                />
                {formErrors.birthday && (
                  <p className="text-destructive text-sm">{formErrors.birthday.message}</p>
                )}
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !isValid}
            >
              {isLoading ? "در حال ثبت نام..." : buttons.SIGNUP_GO}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default function UserSignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  )
}
