import { Download } from "lucide-react";
import { Attachment } from "@/types/ticket";
import { formatFileSize } from "@/lib/format";
import React from "react";

interface AttachmentListProps {
  attachments: Attachment[];
}

export const AttachmentList = React.memo(function AttachmentList({ attachments }: AttachmentListProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="space-y-2 text-right">
      {attachments.map((att) => (
        <a
          key={att.id}
          href={att.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-xs text-primary hover:underline cursor-pointer ml-2"
        >
          {att.fileName} ({formatFileSize(att.fileSize)})
          <Download className="h-4 w-4" />
        </a>
      ))}
    </div>
  );
});
