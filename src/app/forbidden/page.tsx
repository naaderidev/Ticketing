import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldOff } from "lucide-react";

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <ShieldOff className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="mb-2 text-2xl font-bold">ممنوع</h1>
          <p className="mb-6 text-muted-foreground">
            شما اجازه دسترسی به این بخش را ندارید.
          </p>
          <Link href="/user">
            <Button>بازگشت به داشبورد</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
