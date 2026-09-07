"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Trash2, MessageSquare, Copy, Check } from "lucide-react";
import { labels } from "@/lib/strings";
import { PredefinedMessage, SubDepartment } from "@/types/ticket";

interface MessageListProps {
  messages: PredefinedMessage[];
  filteredMessages: PredefinedMessage[];
  isLoading: boolean;
  filterCategory: string;
  categories: { id: string; name: string }[];
  subDepartments: SubDepartment[];
  copiedId: string | null;
  onFilterCategoryChange: (value: string) => void;
  onEdit: (msg: PredefinedMessage) => void;
  onDelete: (msg: PredefinedMessage) => void;
  onCopyShortcode: (shortCode: string, id: string) => void;
  onCreateFirst: () => void;
}

const getCategoryName = (msg: PredefinedMessage) => {
  if (!msg.subDepartmentId) return labels.GENERAL;
  return msg.subDepartment?.name || labels.UNKNOWN;
};

const getCategoryVariant = (
  msg: PredefinedMessage,
): "default" | "secondary" | "open" | "in-progress" | "closed" | "success" | "warning" => {
  if (!msg.subDepartmentId) return "secondary";
  const variants: (
    | "default"
    | "open"
    | "in-progress"
    | "closed"
    | "success"
    | "warning"
  )[] = ["default", "open", "in-progress", "closed", "success", "warning"];
  return variants[msg.subDepartmentId % variants.length];
};

export function MessageList({
  messages,
  filteredMessages,
  isLoading,
  filterCategory,
  categories,
  copiedId,
  onFilterCategoryChange,
  onEdit,
  onDelete,
  onCopyShortcode,
  onCreateFirst,
}: MessageListProps) {
  return (
    <>
      {/* Filter */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">فیلتر بر اساس دسته‌بندی</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={filterCategory} onValueChange={onFilterCategoryChange}>
            <SelectTrigger className="w-full md:w-75">
              <SelectValue placeholder="انتخاب دسته‌بندی" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Messages Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageSquare className="mb-2 h-8 w-8 opacity-50" />
              <p>{labels.EMPTY_MESSAGES}</p>
              <Button variant="link" onClick={onCreateFirst} className="mt-2">
                {labels.MESSAGE_FIRST}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{labels.MESSAGE_COL_TITLE}</TableHead>
                    <TableHead>{labels.MESSAGE_COL_CATEGORY}</TableHead>
                    <TableHead>{labels.MESSAGE_COL_SHORT_CODE}</TableHead>
                    <TableHead>{labels.MESSAGE_COL_CONTENT}</TableHead>
                    <TableHead>{labels.MESSAGE_COL_ACTIONS}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMessages.map((msg) => (
                    <TableRow key={msg.id}>
                      <TableCell className="font-medium">{msg.title}</TableCell>
                      <TableCell>
                        <Badge variant={getCategoryVariant(msg)}>
                          {getCategoryName(msg)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="font-mono">
                            {"{"}
                            {msg.shortCode}
                            {"}"}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => onCopyShortcode(msg.shortCode, msg.id)}
                          >
                            {copiedId === msg.id ? (
                              <Check className="h-3 w-3 text-sky-800" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate text-muted-foreground">
                        {msg.content}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => onEdit(msg)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => onDelete(msg)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
