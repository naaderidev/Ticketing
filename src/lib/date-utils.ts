import DateObject from "date-object"
import persian from "react-date-object/calendars/persian"

function persianToEnglishDigits(str: string): string {
  const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"]
  return str.replace(/[۰-۹]/g, (d) => persianDigits.indexOf(d).toString())
}

export function jalaliToGregorian(jalaliDate: string): Date | null {
  if (!jalaliDate) return null

  try {
    const normalized = persianToEnglishDigits(jalaliDate).replace(/[-\/]/g, "/")
    const parts = normalized.split("/")
    if (parts.length !== 3) return null

    const [year, month, day] = parts.map(Number)

    const date = new DateObject({
      year,
      month,
      day,
      calendar: persian,
    })

    return date.toDate()
  } catch (error) {
    console.error("Error converting Jalali to Gregorian:", error);
    return null;
  }
}
