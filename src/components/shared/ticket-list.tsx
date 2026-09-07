"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import dynamic from "next/dynamic"

const DatePicker = dynamic(() => import("react-multi-date-picker"), { ssr: false })
import persian from "react-date-object/calendars/persian"
import persian_fa from "react-date-object/locales/persian_fa"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Plus, Eye, Building2, BrushCleaning } from "lucide-react"
import { StarRating } from "@/components/shared/star-rating"
import { LoadingSpinner } from "@/components/shared/loading-spinner"
import { STATUS_MAP } from "@/types/ticket"
import { formatDate, toPersianDigits } from "@/lib/format"
import { labels, buttons, titles } from "@/lib/strings"
import { useTickets, useDepartments, useSubDepartments } from "@/hooks"
import { useUser } from "@/contexts/user-context"

interface TicketListProps {
  mode: "user" | "admin"
}

export function TicketList({ mode }: TicketListProps) {
  const isAdmin = mode === "admin"
  const { user } = useUser()

  // Filters
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("")
  const [departmentId, setDepartmentId] = useState("")
  const [subDepartmentId, setSubDepartmentId] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [page, setPage] = useState(1)

  const { data: ticketsData, isLoading } = useTickets({
    search,
    status,
    departmentId,
    subDepartmentId,
    dateFrom,
    dateTo,
    page,
    limit: 10,
    userId: isAdmin ? undefined : user?.id?.toString(),
  })

  const { data: departments = [] } = useDepartments()
  const { data: subDepartments = [] } = useSubDepartments(
    departmentId ? parseInt(departmentId) : 0
  )

  const tickets = ticketsData?.tickets || []
  const pagination = ticketsData?.pagination || { total: 0, page: 1, limit: 10, totalPages: 0 }

  const handleReset = () => {
    setSearch("")
    setStatus("")
    setDepartmentId("")
    setSubDepartmentId("")
    setDateFrom("")
    setDateTo("")
    setPage(1)
  }

  const basePath = isAdmin ? "/admin/tickets" : "/user/tickets"
  const pageTitle = isAdmin ? labels.NAV_TICKETS : titles.MY_TICKETS

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{pageTitle}</h1>
          <p className="text-muted-foreground">
            {toPersianDigits(pagination.total)} {labels.TICKET_COUNT}
          </p>
        </div>
        {!isAdmin && (
          <Link href="/user/tickets/new">
            <Button>
              <Plus className="ml-2 h-4 w-4" />
              {labels.NAV_NEW_TICKET}
            </Button>
          </Link>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{labels.FILTER_SEARCH_TITLE}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <div className="flex flex-col">
              <label className="mb-2 text-sm font-medium">{labels.SEARCH}</label>
              <Input
                placeholder={labels.SEARCH_PLACEHOLDER}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setPage(1)}
              />
            </div>

            <div className="flex flex-col">
              <label className="mb-2 text-sm font-medium">{labels.FILTER_STATUS}</label>
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
                <SelectTrigger>
                  <SelectValue placeholder={labels.FILTER_ALL_STATUS} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{labels.FILTER_ALL_STATUS}</SelectItem>
                  <SelectItem value="OPEN">{labels.STATUS_OPEN}</SelectItem>
                  <SelectItem value="IN_PROGRESS">{labels.STATUS_IN_PROGRESS}</SelectItem>
                  <SelectItem value="CLOSED">{labels.STATUS_CLOSED}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col">
              <label className="mb-2 text-sm font-medium">{labels.FILTER_DEPARTMENT}</label>
              <Select value={departmentId} onValueChange={(v) => { setDepartmentId(v); setSubDepartmentId(""); setPage(1) }}>
                <SelectTrigger>
                  <SelectValue placeholder={labels.FILTER_ALL_DEPARTMENTS} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{labels.FILTER_ALL_DEPARTMENTS}</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id.toString()}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col">
              <label className="mb-2 text-sm font-medium">{labels.FILTER_SUB_DEPARTMENT}</label>
              <Select
                value={subDepartmentId}
                onValueChange={(v) => { setSubDepartmentId(v); setPage(1) }}
                disabled={!departmentId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={labels.FILTER_ALL_SUB_DEPARTMENTS} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{labels.FILTER_ALL_SUB_DEPARTMENTS}</SelectItem>
                  {subDepartments.map((subDept) => (
                    <SelectItem key={subDept.id} value={subDept.id.toString()}>
                      {subDept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col">
              <label className="mb-2 text-sm font-medium">{labels.FILTER_DATE_FROM}</label>
              <DatePicker
                inputClass="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={dateFrom}
                onChange={(date) => { setDateFrom(date && !Array.isArray(date) ? date.format("YYYY-MM-DD") : ""); setPage(1) }}
                calendar={persian}
                locale={persian_fa}
                format="YYYY/MM/DD"
                calendarPosition="bottom-right"
                placeholder="انتخاب تاریخ"
              />
            </div>

            <div className="flex flex-col">
              <label className="mb-2 text-sm font-medium">{labels.FILTER_DATE_TO}</label>
              <DatePicker
                inputClass="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={dateTo}
                onChange={(date) => { setDateTo(date && !Array.isArray(date) ? date.format("YYYY-MM-DD") : ""); setPage(1) }}
                calendar={persian}
                locale={persian_fa}
                format="YYYY/MM/DD"
                calendarPosition="bottom-right"
                placeholder="انتخاب تاریخ"
              />
            </div>

            <div className="flex flex-col">
              <label className="mb-2 text-sm font-medium invisible">-</label>
              <Button variant="outline" onClick={handleReset} className="w-full flex items-center gap-2">
                <BrushCleaning className="h-4 w-4" /><span>{labels.FILTER_CLEAR}</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ticket List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingSpinner />
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Building2 className="mb-2 h-8 w-8 opacity-50" />
              <p>{labels.EMPTY_TICKETS}</p>
              {!isAdmin && (
                <Link href="/user/tickets/new" className="mt-4">
                  <Button variant="link">{buttons.CREATE_TICKET}</Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center">{labels.TICKET_ID}</TableHead>
                    <TableHead className="text-center">{labels.TICKET_SUBJECT}</TableHead>
                    {isAdmin && <TableHead className="text-center">{labels.TICKET_USER}</TableHead>}
                    <TableHead className="text-center">{labels.TICKET_DEPARTMENT}</TableHead>
                    <TableHead className="text-center">{labels.TICKET_STATUS}</TableHead>
                    <TableHead className="text-center">{labels.TICKET_RATING}</TableHead>
                    <TableHead className="text-center">{labels.TICKET_REPLIES}</TableHead>
                    <TableHead className="text-center">{labels.TICKET_CREATED}</TableHead>
                    <TableHead className="text-center">{labels.TICKET_ACTIONS}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell className="text-center font-mono text-xs">
                        {ticket.ticketId}
                      </TableCell>
                      <TableCell className="text-center font-medium max-w-[200px] truncate">
                        {ticket.subject}
                      </TableCell>
                      {isAdmin && <TableCell className="text-center">{ticket.userName}</TableCell>}
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center">
                          <span className="text-sm">{ticket.department.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {ticket.subDepartment?.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={STATUS_MAP[ticket.status].variant}>
                          {STATUS_MAP[ticket.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {ticket.rating ? (
                          <StarRating rating={ticket.rating} size="sm" />
                        ) : (
                          <span className="text-xs text-muted-foreground">{labels.TICKET_NO_RATING}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {toPersianDigits(ticket._count?.replies || 0)}
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {formatDate(ticket.createdAt)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Link href={`${basePath}/${ticket.ticketId}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="ml-1 h-4 w-4" />
                            مشاهده
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage(Math.max(1, page - 1))}
                className={page === 1 ? "pointer-events-none opacity-50" : ""}
              />
            </PaginationItem>
            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
              .filter((p) => {
                const diff = Math.abs(p - page)
                return diff <= 2 || p === 1 || p === pagination.totalPages
              })
              .map((p, index, array) => (
                <PaginationItem key={p}>
                  {index > 0 && array[index - 1] !== p - 1 && (
                    <span className="px-2">...</span>
                  )}
                  <PaginationLink
                    onClick={() => setPage(p)}
                    isActive={p === page}
                  >
                    {toPersianDigits(p)}
                  </PaginationLink>
                </PaginationItem>
              ))}
            <PaginationItem>
              <PaginationNext
                onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
                className={
                  page === pagination.totalPages
                    ? "pointer-events-none opacity-50"
                    : ""
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  )
}
