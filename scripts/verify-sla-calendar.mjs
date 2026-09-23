import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const EXPECTED_CALENDAR_CODE = "IR_STANDARD_WORK_WEEK";
const EXPECTED_MINIMUM_HOLIDAYS = 27;
const REQUIRED_COVERAGE_END = new Date("2027-03-20T00:00:00.000Z");

try {
  const calendar = await prisma.slaCalendar.findFirst({
    where: {
      code: EXPECTED_CALENDAR_CODE,
      version: 1,
      status: "ACTIVE",
      activeKey: EXPECTED_CALENDAR_CODE,
    },
    select: {
      id: true,
      holidays: {
        orderBy: { localDate: "asc" },
        select: { localDate: true },
      },
    },
  });
  const lastHoliday = calendar?.holidays.at(-1)?.localDate;
  if (
    !calendar ||
    calendar.holidays.length < EXPECTED_MINIMUM_HOLIDAYS ||
    !lastHoliday ||
    lastHoliday < REQUIRED_COVERAGE_END
  ) {
    throw new Error("Active SLA calendar does not cover all official 1405 holidays");
  }
  console.log(JSON.stringify({
    event: "sla_calendar_verified",
    calendarCode: EXPECTED_CALENDAR_CODE,
    holidayCount: calendar.holidays.length,
    coveredThrough: lastHoliday.toISOString().slice(0, 10),
  }));
} finally {
  await prisma.$disconnect();
}
