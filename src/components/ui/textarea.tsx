"use client"

import * as React from "react"
import { toPersianDigits } from "@/lib/format"
import { cn } from "@/lib/utils"

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  containerClassName?: string
  showCharacterCount?: boolean
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      containerClassName,
      defaultValue,
      maxLength,
      onChange,
      showCharacterCount = true,
      value,
      "aria-describedby": ariaDescribedBy,
      ...props
    },
    ref
  ) => {
    const counterId = React.useId()
    const [uncontrolledLength, setUncontrolledLength] = React.useState(
      () => String(defaultValue ?? "").length
    )
    const isControlled = value !== undefined
    const currentLength = isControlled
      ? String(value ?? "").length
      : uncontrolledLength
    const hasCounter = showCharacterCount && typeof maxLength === "number"
    const describedBy = [ariaDescribedBy, hasCounter ? counterId : null]
      .filter(Boolean)
      .join(" ") || undefined

    const textarea = (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        defaultValue={defaultValue}
        maxLength={maxLength}
        value={value}
        aria-describedby={describedBy}
        onChange={(event) => {
          if (!isControlled) setUncontrolledLength(event.currentTarget.value.length)
          onChange?.(event)
        }}
        {...props}
      />
    )

    if (!hasCounter) return textarea

    return (
      <div className={cn("space-y-1", containerClassName)}>
        {textarea}
        <p
          id={counterId}
          className="text-left text-xs text-muted-foreground"
          aria-live="polite"
        >
          {toPersianDigits(currentLength)} / {toPersianDigits(maxLength)}
        </p>
      </div>
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
