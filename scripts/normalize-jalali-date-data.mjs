import { PrismaClient } from "@prisma/client";
import DateObjectModule from "react-date-object";
import gregorian from "react-date-object/calendars/gregorian.js";
import persian from "react-date-object/calendars/persian.js";

const DateObject = DateObjectModule.default ?? DateObjectModule;
const prisma = new PrismaClient();

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function toEnglishDigits(value) {
  return value
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
}

function normalizeBirthday(value) {
  const normalized = toEnglishDigits(value.trim()).replaceAll("-", "/");
  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(normalized);
  if (!match) {
    throw new Error(`Unsupported birthday format for value: ${value}`);
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const canonical = `${yearText}/${monthText.padStart(2, "0")}/${dayText.padStart(2, "0")}`;

  if (year >= 1200 && year <= 1600) {
    const jalaliDate = new DateObject({
      date: canonical,
      calendar: persian,
      format: "YYYY/MM/DD",
    });
    if (!jalaliDate.isValid || jalaliDate.format("YYYY/MM/DD") !== canonical) {
      throw new Error(`Invalid Jalali birthday value: ${value}`);
    }
    return canonical;
  }

  if (year >= 1900 && year <= 2200) {
    const gregorianDate = new DateObject({
      date: canonical,
      calendar: gregorian,
      format: "YYYY/MM/DD",
    });
    if (!gregorianDate.isValid || gregorianDate.format("YYYY/MM/DD") !== canonical) {
      throw new Error(`Invalid Gregorian birthday value: ${value}`);
    }
    return gregorianDate.convert(persian).format("YYYY/MM/DD");
  }

  throw new Error(`Birthday year is outside the supported migration range: ${value}`);
}

async function main() {
  const users = await prisma.user.findMany({
    where: { birthday: { not: null } },
    select: { id: true, birthday: true },
  });

  const updates = users.flatMap((user) => {
    if (!user.birthday) return [];
    const birthday = normalizeBirthday(user.birthday);
    return birthday === user.birthday ? [] : [{ id: user.id, birthday }];
  });

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((update) =>
        prisma.user.update({
          where: { id: update.id },
          data: { birthday: update.birthday },
        }),
      ),
    );
  }

  console.log(
    JSON.stringify({
      calendar: "persian",
      checkedBirthdays: users.length,
      normalizedBirthdays: updates.length,
      persistenceTimestamps: "UTC_UNCHANGED",
    }),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Unknown normalization error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
