import { TicketWizard } from "@/components/shared/ticket-wizard"

export default function NewTicketPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">تیکت جدید</h1>
        <p className="text-muted-foreground">
          ایجاد تیکت پشتیبانی جدید
        </p>
      </div>
      <TicketWizard />
    </div>
  )
}
