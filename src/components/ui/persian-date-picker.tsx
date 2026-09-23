"use client";

import dynamic from "next/dynamic";
import type { DateObject } from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persianFa from "react-date-object/locales/persian_fa";
import { toEnglishDigits } from "@/lib/jalali-date";
import { cn } from "@/lib/utils";

const DatePicker = dynamic(
  () => import("react-multi-date-picker").then((module) => module.default),
  { ssr: false }
);

type PersianDatePickerProps = {
  id?: string;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: string;
  maxDate?: string;
  className?: string;
  "aria-label"?: string;
};

export function PersianDatePicker({
  id,
  value = "",
  onChange,
  placeholder = "انتخاب تاریخ",
  disabled,
  minDate,
  maxDate,
  className,
  "aria-label": ariaLabel,
}: Readonly<PersianDatePickerProps>) {
  function handleChange(selected: DateObject | DateObject[] | null) {
    onChange(
      selected && !Array.isArray(selected)
        ? toEnglishDigits(selected.format("YYYY/MM/DD"))
        : ""
    );
  }

  return (
    <DatePicker
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={handleChange}
      calendar={persian}
      locale={persianFa}
      format="YYYY/MM/DD"
      calendarPosition="bottom-right"
      containerClassName={cn("w-full", className)}
      inputClass="rmdp-input ticketing-date-input"
      className="ticketing-persian-calendar"
      placeholder={placeholder}
      disabled={disabled}
      minDate={minDate}
      maxDate={maxDate}
      editable={false}
    />
  );
}
