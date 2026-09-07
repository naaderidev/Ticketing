"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, X, FileText, Image, File } from "lucide-react";
import { cn } from "@/lib/utils";
import { labels, errors } from "@/lib/strings";
import { toPersianDigits } from "@/lib/format";

interface FileUploadProps {
  onUpload: (file: {
    fileName: string;
    fileSize: number;
    fileType: string;
    fileUrl: string;
  }) => void;
  onRemove?: (fileUrl: string) => void;
  files?: {
    fileName: string;
    fileSize: number;
    fileType: string;
    fileUrl: string;
  }[];
  disabled?: boolean;
  className?: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const FILE_ICONS: Record<string, typeof FileText> = {
  "image/jpeg": Image,
  "image/png": Image,
  "image/gif": Image,
  "image/webp": Image,
  "application/pdf": FileText,
  "application/msword": FileText,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    FileText,
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return `${toPersianDigits(0)} ${labels.FORMAT_BYTES}`;
  const k = 1024;
  const sizes = [labels.FORMAT_BYTES, labels.FORMAT_KILOBYTES, labels.FORMAT_MEGABYTES];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (
    toPersianDigits(Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2))) + " " + sizes[i]
  );
}

export function FileUpload({
  onUpload,
  onRemove,
  files = [],
  disabled = false,
  className,
}: Readonly<FileUploadProps>) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    if (file.size > MAX_FILE_SIZE) {
      setError(errors.FILE_TOO_LARGE);
      return;
    }

    setIsUploading(true);
    setProgress(0);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          setProgress(Math.round((event.loaded / event.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          try {
            const data = JSON.parse(xhr.responseText);
            onUpload(data);
            setProgress(100);
          } catch (_parseError) {
            setError(errors.UPLOAD_FILE);
          }
        } else {
          setError(errors.UPLOAD_FILE);
        }
        setIsUploading(false);
      };

      xhr.onerror = () => {
        setError(errors.UPLOAD_FILE);
        setIsUploading(false);
      };

      xhr.open("POST", "/api/upload");
      xhr.send(formData);
    } catch (_err) {
      setError(errors.UPLOAD_FILE);
      setIsUploading(false);
    }

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const getFileIcon = (fileType: string) => {
    const Icon = FILE_ICONS[fileType] || File;
    return Icon;
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors",
          disabled
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer hover:border-primary/50 hover:bg-muted/50",
        )}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {disabled
            ? labels.FILE_NO_UPLOAD
            : labels.FILE_CLICK_TO_UPLOAD}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {labels.FILE_MAX_SIZE}
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || isUploading}
      />

      {isUploading && (
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground text-center">
            {toPersianDigits(progress)}%
          </p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, index) => {
            const Icon = getFileIcon(file.fileType);
            return (
              <div
                key={index}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {file.fileName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.fileSize)}
                  </p>
                </div>
                {onRemove && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => onRemove(file.fileUrl)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
