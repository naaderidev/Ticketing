import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assertSafeDemoResetTarget } from "./demo-reset-safety.mjs";

const prisma = new PrismaClient();
const demoAccounts = JSON.parse(
  readFileSync(
    new URL("../src/config/demo-accounts.json", import.meta.url),
    "utf8"
  )
);
const KPI_DEFINITION_VERSION = "KPI-V1";
const KPI_CONTRACT_HASH = "7406b72fd40a5e7430a898954b5bf46e21b30e65ea0ff322770c512eb8385f3e";
const REPORTING_PROJECTION_CONSUMER = "REPORTING_TICKET_FACT_KPI_V1";
const REPORTING_PROVIDER_CODE = "DEMO_PRODUCT_SEED";
const REPORTING_TIME_ZONE = "Asia/Tehran";
const FCR_WINDOW_MILLISECONDS = 7 * 24 * 60 * 60_000;
const TRANSACTION_TYPES = [
  "PAYMENT",
  "INVOICE",
  "SETTLEMENT",
  "CONTRACT",
  "POWER_PLANT",
  "METER",
  "SAVING_PROGRAM",
];

// تعطیلات رسمی تقویم ۱۴۰۵؛ تاریخ میلادی فقط شکل ذخیره‌سازی @db.Date است.
const IRAN_1405_OFFICIAL_HOLIDAYS = [
  ["2026-03-21", "نوروز و عید سعید فطر"],
  ["2026-03-22", "تعطیلات نوروز و عید سعید فطر"],
  ["2026-03-23", "تعطیلات نوروز"],
  ["2026-03-24", "تعطیلات نوروز"],
  ["2026-04-01", "روز جمهوری اسلامی ایران"],
  ["2026-04-02", "روز طبیعت"],
  ["2026-04-13", "شهادت امام جعفر صادق (ع)"],
  ["2026-05-24", "عید سعید قربان"],
  ["2026-05-27", "عید سعید غدیر خم"],
  ["2026-06-04", "رحلت امام خمینی (ره)"],
  ["2026-06-05", "قیام پانزده خرداد"],
  ["2026-06-24", "تاسوعای حسینی"],
  ["2026-06-25", "عاشورای حسینی"],
  ["2026-08-04", "اربعین حسینی"],
  ["2026-08-12", "رحلت پیامبر اکرم (ص) و شهادت امام حسن مجتبی (ع)"],
  ["2026-08-13", "شهادت امام رضا (ع)"],
  ["2026-08-21", "شهادت امام حسن عسکری (ع)"],
  ["2026-08-30", "میلاد پیامبر اکرم (ص) و امام جعفر صادق (ع)"],
  ["2026-11-13", "شهادت حضرت فاطمه زهرا (س)"],
  ["2026-12-23", "ولادت امام علی (ع) و روز پدر"],
  ["2027-01-06", "مبعث پیامبر اکرم (ص)"],
  ["2027-01-24", "ولادت حضرت قائم (عج)"],
  ["2027-02-11", "پیروزی انقلاب اسلامی ایران"],
  ["2027-02-28", "شهادت امام علی (ع)"],
  ["2027-03-10", "عید سعید فطر"],
  ["2027-03-11", "تعطیل به مناسبت عید سعید فطر"],
  ["2027-03-20", "روز ملی شدن صنعت نفت ایران"],
];

const serviceDefinitions = [
  { code: "IDENTITY_ACCESS", name: "حساب کاربری و اپلیکیشن", description: "ورود، حساب کاربری و خطاهای اپلیکیشن", sortOrder: 10 },
  { code: "ORGANIZATION_ACCESS", name: "شرکت و نماینده", description: "دسترسی سازمانی و نمایندگان مجاز", sortOrder: 20 },
  { code: "ELECTRICITY_TRADE", name: "خرید و فروش برق", description: "فروش برق، تسویه و هماهنگی تأمین", sortOrder: 30 },
  { code: "CONTRACTS", name: "قراردادها", description: "قرارداد، امضا و نماینده مجاز", sortOrder: 40 },
  { code: "FINANCE", name: "صورتحساب و پرداخت", description: "صورتحساب، پرداخت و امور مالی", sortOrder: 50 },
  { code: "ASSET_MEASUREMENT", name: "نیروگاه و اندازه‌گیری", description: "نیروگاه، کنتور و قرائت", sortOrder: 60 },
  { code: "ENERGY_EFFICIENCY", name: "صرفه‌جویی", description: "صرفه‌جویی مصرف و پاداش", sortOrder: 70 },
  { code: "SUPPORT_QUALITY", name: "کیفیت پشتیبانی", description: "شکایت و ارزیابی تجربه پشتیبانی", sortOrder: 80 },
];

const requestTypeDefinitions = [
  { serviceCode: "IDENTITY_ACCESS", code: "ACCOUNT_ACCESS", name: "حساب کاربری و ورود", businessSubjectType: "ACCOUNT", requiresBusinessSubject: false, requiresRootCause: false, sortOrder: 10, teamCode: "CUSTOMER_AFFAIRS", queueCode: "CUSTOMER_ACCOUNT_INBOX", priority: "HIGH" },
  { serviceCode: "IDENTITY_ACCESS", code: "APP_ERROR", name: "خطای اپلیکیشن", businessSubjectType: "APP_VERSION", requiresBusinessSubject: false, requiresRootCause: true, sortOrder: 20, teamCode: "TECHNICAL", queueCode: "APP_ERRORS", priority: "HIGH" },
  { serviceCode: "ORGANIZATION_ACCESS", code: "COMPANY_ACCESS", name: "دسترسی شرکت و نماینده", businessSubjectType: "ORGANIZATION_MEMBERSHIP", requiresBusinessSubject: true, requiresRootCause: false, sortOrder: 10, teamCode: "CUSTOMER_AFFAIRS", queueCode: "ORGANIZATION_ACCESS_INBOX", priority: "HIGH" },
  { serviceCode: "ELECTRICITY_TRADE", code: "ELECTRICITY_SALE", name: "فروش برق و تسویه", businessSubjectType: "SETTLEMENT", requiresBusinessSubject: true, requiresRootCause: false, sortOrder: 10, teamCode: "PROCUREMENT", queueCode: "ELECTRICITY_SETTLEMENT", priority: "HIGH" },
  { serviceCode: "CONTRACTS", code: "CONTRACT", name: "قرارداد و امضا", businessSubjectType: "CONTRACT", requiresBusinessSubject: true, requiresRootCause: false, sortOrder: 10, teamCode: "LEGAL", queueCode: "CONTRACT_REVIEW", priority: "NORMAL" },
  { serviceCode: "FINANCE", code: "INVOICE", name: "صورتحساب", businessSubjectType: "INVOICE", requiresBusinessSubject: true, requiresRootCause: false, sortOrder: 10, teamCode: "FINANCE", queueCode: "FINANCE_INVOICE", priority: "NORMAL" },
  { serviceCode: "FINANCE", code: "PAYMENT", name: "پرداخت", businessSubjectType: "PAYMENT", requiresBusinessSubject: true, requiresRootCause: false, sortOrder: 20, teamCode: "FINANCE", queueCode: "FINANCE_PAYMENT", priority: "HIGH" },
  { serviceCode: "ASSET_MEASUREMENT", code: "POWER_PLANT", name: "نیروگاه", businessSubjectType: "POWER_PLANT", requiresBusinessSubject: true, requiresRootCause: false, sortOrder: 10, teamCode: "POWER_PLANT", queueCode: "POWER_PLANT_OPERATIONS", priority: "NORMAL" },
  { serviceCode: "ASSET_MEASUREMENT", code: "METER", name: "کنتور و قرائت", businessSubjectType: "METER", requiresBusinessSubject: true, requiresRootCause: false, sortOrder: 20, teamCode: "METERING", queueCode: "METER_READING", priority: "NORMAL" },
  { serviceCode: "ENERGY_EFFICIENCY", code: "SAVINGS", name: "صرفه‌جویی و پاداش", businessSubjectType: "SAVING_PROGRAM", requiresBusinessSubject: true, requiresRootCause: false, sortOrder: 10, teamCode: "SAVINGS", queueCode: "SAVINGS_REWARDS", priority: "LOW" },
  { serviceCode: "SUPPORT_QUALITY", code: "SUPPORT_COMPLAINT", name: "شکایت از عملکرد پشتیبانی", businessSubjectType: "RELATED_TICKET", requiresBusinessSubject: true, requiresRootCause: true, sortOrder: 10, teamCode: "SUPPORT_QUALITY", queueCode: "SUPPORT_COMPLAINTS", priority: "CRITICAL" },
];

const rootCauseDefinitions = [
  { code: "APP_AUTH_SESSION", name: "اختلال نشست و احراز هویت", serviceCode: "IDENTITY_ACCESS" },
  { code: "APP_FRONTEND_DEFECT", name: "خطای رابط کاربری", serviceCode: "IDENTITY_ACCESS" },
  { code: "PAYMENT_GATEWAY_FAILURE", name: "اختلال درگاه پرداخت", serviceCode: "FINANCE" },
  { code: "INVOICE_CALCULATION", name: "خطای محاسبه صورتحساب", serviceCode: "FINANCE" },
  { code: "SETTLEMENT_DELAY", name: "تأخیر در تسویه", serviceCode: "ELECTRICITY_TRADE" },
  { code: "METER_DATA_MISSING", name: "فقدان یا تأخیر داده کنتور", serviceCode: "ASSET_MEASUREMENT" },
  { code: "SUPPORT_PROCESS_GAP", name: "نقص فرایند پاسخ‌گویی پشتیبانی", serviceCode: "SUPPORT_QUALITY" },
];

const teamDefinitions = [
  { code: "CUSTOMER_AFFAIRS", name: "امور مشتریان", description: "حساب، راهنمایی و دسترسی سازمانی" },
  { code: "FINANCE", name: "مالی", description: "صورتحساب، پرداخت و تسویه" },
  { code: "PROCUREMENT", name: "تأمین و فروش برق", description: "خرید، فروش و هماهنگی برق" },
  { code: "LEGAL", name: "حقوقی", description: "قرارداد، امضا و نمایندگان مجاز" },
  { code: "POWER_PLANT", name: "نیروگاه", description: "عملیات و اطلاعات نیروگاه" },
  { code: "METERING", name: "اندازه‌گیری", description: "کنتور و قرائت مصرف" },
  { code: "SAVINGS", name: "صرفه‌جویی", description: "برنامه‌های صرفه‌جویی و پاداش" },
  { code: "SUPPORT_QUALITY", name: "کنترل کیفیت پشتیبانی", description: "رسیدگی به شکایت و نارضایتی شدید" },
  { code: "TECHNICAL", name: "فنی", description: "خطاهای اپلیکیشن و مسائل فنی" },
];

const queueDefinitions = [
  { teamCode: "CUSTOMER_AFFAIRS", code: "CUSTOMER_ACCOUNT_INBOX", name: "حساب و ورود", isDefault: true },
  { teamCode: "CUSTOMER_AFFAIRS", code: "ORGANIZATION_ACCESS_INBOX", name: "دسترسی سازمانی", isDefault: false },
  { teamCode: "FINANCE", code: "FINANCE_INVOICE", name: "صورتحساب", isDefault: true },
  { teamCode: "FINANCE", code: "FINANCE_PAYMENT", name: "پرداخت", isDefault: false },
  { teamCode: "PROCUREMENT", code: "ELECTRICITY_SETTLEMENT", name: "فروش برق و تسویه", isDefault: true },
  { teamCode: "LEGAL", code: "CONTRACT_REVIEW", name: "بررسی قرارداد", isDefault: true },
  { teamCode: "POWER_PLANT", code: "POWER_PLANT_OPERATIONS", name: "عملیات نیروگاه", isDefault: true },
  { teamCode: "METERING", code: "METER_READING", name: "کنتور و قرائت", isDefault: true },
  { teamCode: "SAVINGS", code: "SAVINGS_REWARDS", name: "صرفه‌جویی و پاداش", isDefault: true },
  { teamCode: "SUPPORT_QUALITY", code: "SUPPORT_COMPLAINTS", name: "شکایت‌های پشتیبانی", isDefault: true },
  { teamCode: "TECHNICAL", code: "APP_ERRORS", name: "خطاهای اپلیکیشن", isDefault: true },
];

const permissionDefinitions = [
  ["organization.create", "ایجاد سازمان و مدیر اولیه"],
  ["organization.membership.read", "مشاهده اعضا و محدوده دسترسی سازمان"],
  ["organization.membership.request", "درخواست تغییر عضویت یا محدوده دسترسی"],
  ["organization.membership.approve", "تأیید یا رد درخواست تغییر عضویت"],
  ["organization.audit.read", "مشاهده تاریخچه دسترسی سازمان"],
  ["support.catalog.read", "مشاهده کاتالوگ خدمات پشتیبانی"],
  ["support.catalog.manage", "مدیریت خدمت و نوع درخواست"],
  ["support.team.read", "مشاهده تیم‌های پشتیبانی"],
  ["support.team.manage", "مدیریت تیم و اعضای آن"],
  ["support.queue.read", "مشاهده صف‌های مجاز"],
  ["support.queue.manage", "مدیریت صف‌های پشتیبانی"],
  ["support.routing.manage", "انتشار نسخه مسیر نوع درخواست"],
  ["support.workspace.access", "ورود به فضای کاری پشتیبانی"],
  ["support.sla.read", "مشاهده وضعیت و مهلت‌های SLA"],
  ["support.sla.manage", "مدیریت سیاست و تقویم SLA"],
  ["support.sla.enforce", "اجرای هشدار و تشدید SLA"],
  ["ticket.workspace.read", "مشاهده درخواست‌های صف یا تیم مجاز"],
  ["ticket.workspace.assign", "تخصیص مالک درخواست در تیم مجاز"],
  ["ticket.workspace.transfer", "انتقال درخواست میان تیم و صف"],
  ["ticket.workspace.reply", "ثبت پاسخ عمومی یا یادداشت داخلی"],
  ["ticket.workspace.resolve", "ثبت نتیجه و تغییر چرخه عمر درخواست"],
  ["reporting.kpi.read.team", "مشاهده شاخص‌های پشتیبانی در تیم‌های صریح کاربر"],
  ["reporting.kpi.read.global", "مشاهده شاخص‌های تجمیعی همه تیم‌های پشتیبانی"],
  ["reporting.kpi.audit.read", "مشاهده ممیزی‌شده شاخص‌های تجمیعی بدون Drill-down"],
  ["reporting.kpi.export", "خروجی‌گرفتن از شاخص‌ها در محدوده مجاز"],
  ["knowledge.article.manage", "ایجاد و ویرایش پیش‌نویس محتوای دانش"],
  ["knowledge.article.publish", "تأیید و انتشار نسخه محتوای دانش"],
];

const roleDefinitions = [
  { key: "SUPPORT_AGENT", name: "کارشناس پشتیبانی", kind: "STAFF" },
  { key: "SUPERVISOR", name: "سرپرست پشتیبانی", kind: "STAFF" },
  { key: "SUPPORT_MANAGER", name: "مدیر پشتیبانی", kind: "STAFF" },
  { key: "ACCOUNT_MANAGER", name: "مدیر حساب سازمانی", kind: "STAFF" },
  { key: "SYSTEM_ADMINISTRATOR", name: "مدیر سیستم", kind: "SYSTEM" },
  { key: "AUDITOR", name: "ممیز", kind: "SYSTEM" },
  { key: "REPORTING_EXPORTER", name: "خروجی‌گیر گزارش", kind: "STAFF" },
];

function fingerprintUsers(users) {
  return createHash("sha256").update(JSON.stringify(users)).digest("hex");
}

function validateDemoAccounts() {
  const administrators = demoAccounts.filter((account) => account.role === "ADMIN");
  const customers = demoAccounts.filter((account) => account.role === "USER");
  const staffRoleKeys = new Set(
    demoAccounts.flatMap((account) => account.staffRoleKey ? [account.staffRoleKey] : [])
  );
  const requiredStaffRoleKeys = new Set(roleDefinitions.map((role) => role.key));
  const organizationRoles = new Set(
    demoAccounts.flatMap((account) => account.organizationRole ? [account.organizationRole] : [])
  );
  const uniqueMobiles = new Set(demoAccounts.map((account) => account.mobile));
  const uniqueNationalCodes = new Set(
    demoAccounts.map((account) => account.nationalCode)
  );

  if (
    demoAccounts.length !== 12 ||
    administrators.length === 0 ||
    customers.length === 0
  ) {
    throw new Error("Demo seed requires exactly twelve staff and customer personas");
  }
  for (const roleKey of requiredStaffRoleKeys) {
    if (!staffRoleKeys.has(roleKey)) {
      throw new Error(`Demo seed is missing the ${roleKey} staff persona`);
    }
  }
  if (!organizationRoles.has("MANAGER") || !organizationRoles.has("REPRESENTATIVE")) {
    throw new Error("Demo seed requires company manager and representative personas");
  }
  if (
    uniqueMobiles.size !== demoAccounts.length ||
    uniqueNationalCodes.size !== demoAccounts.length
  ) {
    throw new Error("Demo account mobile and national-code values must be unique");
  }
}

async function buildDemoUserRows() {
  validateDemoAccounts();
  const passwordHashes = new Map();
  for (const account of demoAccounts) {
    if (!passwordHashes.has(account.password)) {
      passwordHashes.set(account.password, await bcrypt.hash(account.password, 12));
    }
  }

  return demoAccounts.map((account) => ({
    firstName: account.firstName,
    lastName: account.lastName,
    nationalCode: account.nationalCode,
    mobile: account.mobile,
    passwordHash: passwordHashes.get(account.password),
    role: account.role,
    email: account.email,
    birthday: account.birthday,
  }));
}

async function replaceUsersWithDemoAccounts(transaction, demoUserRows) {
  await transaction.user.deleteMany();
  await transaction.user.createMany({ data: demoUserRows });
  return transaction.user.findMany({ orderBy: { id: "asc" } });
}

function hashReportingParty(partyId) {
  const secret = process.env.SECURITY_HASH_SECRET;
  if (!secret) throw new Error("SECURITY_HASH_SECRET is required");
  return createHmac("sha256", secret)
    .update(`reporting-party:${partyId}`)
    .digest("hex");
}

function minutesFrom(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000);
}

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60_000);
}

function reportingLocalDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORTING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function shiftLocalDate(localDate, days) {
  const [year, month, day] = localDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

function tehranMidnight(localDate) {
  return new Date(`${localDate}T00:00:00+03:30`);
}

function durationMilliseconds(minutes) {
  return BigInt(minutes) * BigInt(60_000);
}

async function deleteNonUserData(transaction) {
  await transaction.supportIncidentTicket.deleteMany();
  await transaction.supportIncidentImpact.deleteMany();
  await transaction.supportIncident.deleteMany();
  await transaction.ticketAccountReview.deleteMany();
  await transaction.recurringProblemSignal.deleteMany();
  await transaction.transactionVolumeDaily.deleteMany();
  await transaction.supportJourney.deleteMany();
  await transaction.knowledgeArticle.updateMany({
    data: { status: "ARCHIVED", publishedVersionId: null },
  });
  await transaction.knowledgeArticleVersion.deleteMany();
  await transaction.knowledgeArticle.deleteMany();
  await transaction.ticketReportingFact.deleteMany();
  await transaction.reportingProcessedEvent.deleteMany();
  await transaction.reportingProjectionCheckpoint.deleteMany();
  await transaction.kpiDefinitionVersion.deleteMany();
  await transaction.outboxDelivery.deleteMany();
  await transaction.outboxEvent.deleteMany();
  await transaction.ticketSlaPause.deleteMany();
  await transaction.ticketSla.deleteMany();
  await transaction.ticketResolutionCycle.deleteMany();
  await transaction.ticketWorkItem.deleteMany();
  await transaction.routingDecision.deleteMany();
  await transaction.ticketAssignment.deleteMany();
  await transaction.ticketBusinessReference.deleteMany();
  await transaction.ticketCommandReceipt.deleteMany();
  await transaction.ticketAttachment.deleteMany();
  await transaction.ticketMessage.deleteMany();
  await transaction.ticketReply.deleteMany();
  await transaction.notification.deleteMany();
  await transaction.ticketEvent.deleteMany();
  await transaction.ticket.deleteMany();
  await transaction.organizationServicePlan.deleteMany();
  await transaction.reportingRootCauseDimension.deleteMany();
  await transaction.pendingUpload.deleteMany();
  await transaction.attachmentDeletionJob.deleteMany();
  await transaction.session.deleteMany();
  await transaction.auditEvent.deleteMany();
  await transaction.rateLimitBucket.deleteMany();
  await transaction.organizationAccessRequestScope.deleteMany();
  await transaction.organizationAccessRequest.deleteMany();
  await transaction.organizationMembershipScope.deleteMany();
  await transaction.organizationMembership.deleteMany();
  await transaction.organizationUnit.deleteMany();
  await transaction.userRoleAssignment.deleteMany();
  await transaction.rolePermission.deleteMany();
  await transaction.legacySupportCatalogMapping.deleteMany();
  await transaction.supportCatalogRoute.deleteMany();
  await transaction.slaHoliday.deleteMany();
  await transaction.slaPolicy.deleteMany();
  await transaction.slaCalendar.deleteMany();
  await transaction.supportQueue.deleteMany();
  await transaction.supportTeam.deleteMany();
  await transaction.supportRequestType.deleteMany();
  await transaction.supportService.deleteMany();
  await transaction.fAQ.deleteMany();
  await transaction.predefinedMessage.deleteMany();
  await transaction.subDepartment.deleteMany();
  await transaction.department.deleteMany();
  await transaction.personProfile.deleteMany();
  await transaction.organization.deleteMany();
  await transaction.party.deleteMany();
  await transaction.permission.deleteMany();
  await transaction.role.deleteMany();
}

async function seedReportingContract(transaction) {
  await transaction.kpiDefinitionVersion.create({
    data: {
      version: KPI_DEFINITION_VERSION,
      status: "ACTIVE",
      activeKey: "SUPPORT_KPI",
      contractHash: KPI_CONTRACT_HASH,
      definition: {
        source: "docs/product-refactor/kpi-definitions.md",
        kpiCount: 9,
        timeZone: "Asia/Tehran",
        contractStatus: "APPROVED",
      },
      effectiveFrom: daysAgo(400),
    },
  });
}

async function seedAuthorization(transaction, users) {
  await transaction.role.createMany({ data: roleDefinitions });
  await transaction.permission.createMany({
    data: permissionDefinitions.map(([key, description]) => ({ key, description })),
  });
  const [roles, permissions] = await Promise.all([
    transaction.role.findMany(),
    transaction.permission.findMany(),
  ]);
  const roleByKey = new Map(roles.map((role) => [role.key, role]));
  const permissionByKey = new Map(permissions.map((permission) => [permission.key, permission]));
  const allPermissionKeys = permissions.map((permission) => permission.key);
  const grants = {
    SYSTEM_ADMINISTRATOR: allPermissionKeys.filter((key) => !key.startsWith("reporting.")),
    SUPPORT_MANAGER: [...allPermissionKeys.filter((key) => key.startsWith("support.") || key.startsWith("ticket.") || key.startsWith("knowledge.")), "reporting.kpi.read.global"],
    SUPERVISOR: ["support.catalog.read", "support.team.read", "support.queue.read", "support.workspace.access", "support.sla.read", "ticket.workspace.read", "ticket.workspace.assign", "ticket.workspace.transfer", "ticket.workspace.reply", "ticket.workspace.resolve", "reporting.kpi.read.team"],
    SUPPORT_AGENT: ["support.catalog.read", "support.team.read", "support.queue.read", "support.workspace.access", "ticket.workspace.read", "ticket.workspace.reply", "ticket.workspace.resolve"],
    ACCOUNT_MANAGER: ["organization.membership.read", "organization.audit.read", "support.catalog.read", "support.team.read", "support.queue.read", "support.workspace.access", "support.sla.read", "ticket.workspace.read", "ticket.workspace.reply"],
    AUDITOR: ["organization.audit.read", "support.sla.read", "reporting.kpi.audit.read"],
    REPORTING_EXPORTER: ["reporting.kpi.read.global", "reporting.kpi.export"],
  };
  await transaction.rolePermission.createMany({
    data: Object.entries(grants).flatMap(([roleKey, keys]) => keys.map((key) => ({
      roleId: roleByKey.get(roleKey).id,
      permissionId: permissionByKey.get(key).id,
    }))),
  });
  const userByMobile = new Map(users.map((user) => [user.mobile, user]));
  const globalAssignments = demoAccounts.flatMap((account) => {
    if (!account.staffRoleKey || account.supportTeamCodes?.length) return [];
    const user = userByMobile.get(account.mobile);
    const role = roleByKey.get(account.staffRoleKey);
    if (!user || !role) {
      throw new Error(`Cannot assign demo staff role for ${account.key}`);
    }
    return [{
      userId: user.id,
      roleId: role.id,
      scopeType: "GLOBAL",
      scopeKey: "*",
      status: "ACTIVE",
    }];
  });
  await transaction.userRoleAssignment.createMany({
    data: globalAssignments,
  });
  return { roleByKey };
}

async function seedDemoSupportTeamMemberships(
  transaction,
  users,
  catalog,
  roleByKey
) {
  const userByMobile = new Map(users.map((user) => [user.mobile, user]));
  const scopedStaffAccounts = demoAccounts.filter(
    (account) => account.staffRoleKey && account.supportTeamCodes?.length
  );
  await transaction.userRoleAssignment.createMany({
    data: scopedStaffAccounts.flatMap((account) => {
      const user = userByMobile.get(account.mobile);
      const role = roleByKey.get(account.staffRoleKey);
      if (!user || !role) {
        throw new Error(`Cannot assign demo team role for ${account.key}`);
      }
      const teamCodes = account.supportTeamCodes.includes("*")
        ? [...catalog.teamByCode.keys()]
        : account.supportTeamCodes;
      return teamCodes.map((teamCode) => {
        const team = catalog.teamByCode.get(teamCode);
        if (!team) throw new Error(`Unknown demo support team: ${teamCode}`);
        return {
        userId: user.id,
        roleId: role.id,
        supportTeamId: team.id,
        scopeType: "SUPPORT_TEAM",
        scopeKey: String(team.id),
        status: "ACTIVE",
        };
      });
    }),
  });
}

async function seedPartiesAndOrganizations(transaction, users) {
  const personPartyByUserId = new Map();
  for (const user of users) {
    const party = await transaction.party.create({
      data: {
        type: "PERSON",
        displayName: `${user.firstName} ${user.lastName}`.trim(),
        personProfile: { create: { userId: user.id } },
      },
    });
    personPartyByUserId.set(user.id, party);
  }

  const organizationParty = await transaction.party.create({
    data: {
      type: "ORGANIZATION",
      displayName: "شرکت انرژی آفتاب",
      organization: {
        create: {
          legalName: "شرکت انرژی آفتاب",
          nationalId: "14001234567",
          units: {
            create: [
              { name: "دفتر مرکزی", code: "HQ" },
              { name: "نیروگاه خورشیدی یزد", code: "YAZD-SOLAR" },
            ],
          },
        },
      },
    },
    include: { organization: true },
  });
  const organization = organizationParty.organization;
  const userByMobile = new Map(users.map((user) => [user.mobile, user]));
  for (const account of demoAccounts.filter((item) => item.organizationRole)) {
    const user = userByMobile.get(account.mobile);
    if (!user) throw new Error(`Organization demo user is missing: ${account.key}`);
    await transaction.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: account.organizationRole,
        status: "ACTIVE",
        scopes: {
          create: [{
            type: account.organizationScopeType,
            scopeKey: account.organizationScopeKey,
          }],
        },
      },
    });
  }
  return { personPartyByUserId, organizationParty, organization };
}

async function seedCatalog(transaction) {
  await transaction.supportService.createMany({ data: serviceDefinitions });
  await transaction.supportTeam.createMany({ data: teamDefinitions });
  const [services, teams] = await Promise.all([
    transaction.supportService.findMany(),
    transaction.supportTeam.findMany(),
  ]);
  const serviceByCode = new Map(services.map((service) => [service.code, service]));
  const teamByCode = new Map(teams.map((team) => [team.code, team]));
  await transaction.supportQueue.createMany({
    data: queueDefinitions.map((queue) => ({
      teamId: teamByCode.get(queue.teamCode).id,
      code: queue.code,
      name: queue.name,
      description: `صف تخصصی ${queue.name}`,
      isDefault: queue.isDefault,
    })),
  });
  await transaction.supportRequestType.createMany({
    data: requestTypeDefinitions.map((requestType) => ({
      serviceId: serviceByCode.get(requestType.serviceCode).id,
      code: requestType.code,
      name: requestType.name,
      businessSubjectType: requestType.businessSubjectType,
      requiresBusinessSubject: requestType.requiresBusinessSubject,
      requiresRootCause: requestType.requiresRootCause,
      sortOrder: requestType.sortOrder,
    })),
  });
  const [queues, requestTypes] = await Promise.all([
    transaction.supportQueue.findMany(),
    transaction.supportRequestType.findMany(),
  ]);
  return {
    serviceByCode,
    teamByCode,
    queueByCode: new Map(queues.map((queue) => [queue.code, queue])),
    requestTypeByCode: new Map(requestTypes.map((requestType) => [requestType.code, requestType])),
  };
}

async function seedRootCauseDimensions(transaction) {
  await transaction.reportingRootCauseDimension.createMany({
    data: rootCauseDefinitions.map((definition) => ({
      code: definition.code,
      name: definition.name,
      serviceCode: definition.serviceCode,
      status: "ACTIVE",
    })),
  });
  const rootCauses = await transaction.reportingRootCauseDimension.findMany();
  return new Map(rootCauses.map((rootCause) => [rootCause.code, rootCause]));
}

async function seedSlaAndRoutes(transaction, catalog) {
  const calendar = await transaction.slaCalendar.create({
    data: {
      code: "IR_STANDARD_WORK_WEEK",
      version: 1,
      name: "تقویم کاری پایه ایران",
      timeZone: "Asia/Tehran",
      weeklySchedule: {
        SATURDAY: [{ start: "08:00", end: "17:00" }],
        SUNDAY: [{ start: "08:00", end: "17:00" }],
        MONDAY: [{ start: "08:00", end: "17:00" }],
        TUESDAY: [{ start: "08:00", end: "17:00" }],
        WEDNESDAY: [{ start: "08:00", end: "17:00" }],
        THURSDAY: [],
        FRIDAY: [],
      },
      activeKey: "IR_STANDARD_WORK_WEEK",
    },
  });
  await transaction.slaHoliday.createMany({
    data: IRAN_1405_OFFICIAL_HOLIDAYS.map(([localDate, name]) => ({
      calendarId: calendar.id,
      localDate: new Date(`${localDate}T00:00:00.000Z`),
      name,
    })),
  });
  const slaDefinitions = [
    { code: "BASE_CRITICAL", name: "SLA بحرانی", priority: "CRITICAL", clockType: "CALENDAR", calendarId: null, firstResponseMinutes: 15, resolutionMinutes: 240 },
    { code: "BASE_HIGH", name: "SLA اولویت بالا", priority: "HIGH", clockType: "BUSINESS", calendarId: calendar.id, firstResponseMinutes: 120, resolutionMinutes: 540 },
    { code: "BASE_NORMAL", name: "SLA عادی", priority: "NORMAL", clockType: "BUSINESS", calendarId: calendar.id, firstResponseMinutes: 240, resolutionMinutes: 1620 },
    { code: "BASE_LOW", name: "SLA کم‌اولویت", priority: "LOW", clockType: "BUSINESS", calendarId: calendar.id, firstResponseMinutes: 540, resolutionMinutes: 2700 },
  ];
  await transaction.slaPolicy.createMany({
    data: slaDefinitions.map((definition) => ({ ...definition, version: 1, activeKey: definition.priority })),
  });
  const policies = await transaction.slaPolicy.findMany();
  const policyByPriority = new Map(policies.map((policy) => [policy.priority, policy]));
  const routeByRequestTypeCode = new Map();
  for (const requestTypeDefinition of requestTypeDefinitions) {
    const requestType = catalog.requestTypeByCode.get(requestTypeDefinition.code);
    const route = await transaction.supportCatalogRoute.create({
      data: {
        requestTypeId: requestType.id,
        queueId: catalog.queueByCode.get(requestTypeDefinition.queueCode).id,
        slaPolicyId: policyByPriority.get(requestTypeDefinition.priority).id,
        version: 1,
        defaultPriority: requestTypeDefinition.priority,
        activeKey: requestTypeDefinition.code,
      },
    });
    routeByRequestTypeCode.set(requestTypeDefinition.code, route);
  }
  return { calendar, policyByPriority, routeByRequestTypeCode };
}

async function seedCompatibilityAndKnowledge(transaction) {
  const compatibilityDepartment = await transaction.department.create({
    data: { name: "ورودی داخلی سامانه", internalOnly: true },
  });
  const compatibilitySubDepartment = await transaction.subDepartment.create({
    data: { name: "مسیریابی کاتالوگ پشتیبانی", departmentId: compatibilityDepartment.id, internalOnly: true },
  });
  const knowledgeCategories = [];
  for (const [name, subName] of [
    ["حساب و اپلیکیشن", "ورود و خطاهای فنی"],
    ["شرکت و قرارداد", "نمایندگان و دسترسی"],
    ["مالی و فروش برق", "صورتحساب، پرداخت و تسویه"],
    ["نیروگاه و کنتور", "دارایی و اندازه‌گیری"],
  ]) {
    const department = await transaction.department.create({ data: { name } });
    const subDepartment = await transaction.subDepartment.create({ data: { name: subName, departmentId: department.id } });
    knowledgeCategories.push({ department, subDepartment });
  }
  const faqDefinitions = [
    [0, "اگر وارد حسابم نشدم چه کنم؟", "ابتدا شماره موبایل و رمز عبور را بررسی کنید. اگر مشکل ادامه داشت، یک درخواست از نوع «حساب کاربری و ورود» ثبت کنید."],
    [1, "چطور به پنل شرکت دسترسی بگیرم؟", "مدیر سازمان باید عضویت و محدوده دسترسی شما را تأیید کند. درخواست‌های حساس پس از بررسی انسانی اعمال می‌شوند."],
    [2, "وضعیت پرداخت را از کجا پیگیری کنم؟", "شماره پرداخت یا صورتحساب را هنگام ثبت درخواست وارد کنید تا درخواست مستقیماً به صف مالی هدایت شود."],
    [3, "برای مغایرت قرائت کنتور چه اطلاعاتی لازم است؟", "شناسه کنتور، بازه قرائت و در صورت امکان تصویر کنتور را ضمیمه کنید."],
  ];
  for (const [priority, [index, question, answer]] of faqDefinitions.entries()) {
    const faq = await transaction.fAQ.create({
      data: {
        question,
        answer,
        priority: priority + 1,
        departmentId: knowledgeCategories[index].department.id,
        subDepartmentId: knowledgeCategories[index].subDepartment.id,
      },
    });
    await transaction.knowledgeArticle.create({
      data: {
        slug: `legacy-faq-${faq.id}`,
        audience: "AUTHENTICATED",
        status: "DRAFT",
        sourceFaqId: faq.id,
        versions: {
          create: {
            version: 1,
            title: question,
            body: answer,
            contentChecksum: createHash("sha256")
              .update(`${question}\n${answer}`)
              .digest("hex"),
          },
        },
      },
    });
  }
  const publicKnowledgeDefinitions = [
    {
      slug: "recover-account-access",
      requestTypeCode: "ACCOUNT_ACCESS",
      title: "اگر وارد حسابم نشدم چه کنم؟",
      body: "شماره موبایل و رمز عبور را دوباره بررسی کنید. سپس مرورگر را تازه‌سازی و یک‌بار دیگر تلاش کنید. اگر مشکل ادامه داشت، درخواست «حساب کاربری و ورود» ثبت کنید تا وضعیت نشست و دسترسی شما بررسی شود.",
    },
    {
      slug: "application-error-checklist",
      requestTypeCode: "APP_ERROR",
      title: "برای گزارش خطای اپلیکیشن چه اطلاعاتی لازم است؟",
      body: "نام صفحه، زمان تقریبی رخداد، متن خطا و نسخه مرورگر یا اپلیکیشن را ثبت کنید. تصویر خطا را هم پیوست کنید تا تیم فنی بتواند مشکل را سریع‌تر بازتولید کند.",
    },
    {
      slug: "company-access-guide",
      requestTypeCode: "COMPANY_ACCESS",
      title: "چطور به پنل شرکت دسترسی بگیرم؟",
      body: "مدیر شرکت باید برای شما عضویت فعال و محدوده دسترسی تعریف کند. پس از تأیید، از انتخاب‌گر حساب در سربرگ نام شرکت را انتخاب کنید و درخواست را در همان حساب ثبت کنید.",
    },
    {
      slug: "electricity-settlement-follow-up",
      requestTypeCode: "ELECTRICITY_SALE",
      title: "تسویه فروش برق را چطور پیگیری کنم؟",
      body: "شناسه تسویه و بازه زمانی مربوط را آماده کنید. در حساب شرکت، خدمت «خرید و فروش برق» را انتخاب و مرجع تسویه را به درخواست متصل کنید.",
    },
    {
      slug: "contract-change-request",
      requestTypeCode: "CONTRACT",
      title: "برای اصلاح قرارداد یا نماینده مجاز چه کنم؟",
      body: "در حساب شرکت، قرارداد مربوط را انتخاب کنید و تغییر موردنظر را دقیق بنویسید. نسخه قرارداد یا مستند اختیار امضا را در صورت نیاز پیوست کنید.",
    },
    {
      slug: "invoice-discrepancy",
      requestTypeCode: "INVOICE",
      title: "مغایرت صورتحساب را چگونه اعلام کنم؟",
      body: "شماره صورتحساب، دوره مالی و ردیف دارای مغایرت را مشخص کنید. اگر محاسبه مورد انتظار دارید، جزئیات آن را در شرح درخواست بنویسید.",
    },
    {
      slug: "payment-status-follow-up",
      requestTypeCode: "PAYMENT",
      title: "وضعیت پرداخت را از کجا پیگیری کنم؟",
      body: "شماره پرداخت یا شناسه تراکنش را جست‌وجو و انتخاب کنید. زمان پرداخت و نتیجه نمایش‌داده‌شده در درگاه را هم در شرح درخواست وارد کنید.",
    },
    {
      slug: "meter-reading-discrepancy",
      requestTypeCode: "METER",
      title: "برای مغایرت قرائت کنتور چه اطلاعاتی لازم است؟",
      body: "شناسه کنتور، بازه قرائت و مقدار ثبت‌شده را وارد کنید. تصویر واضح کنتور و تاریخ تصویربرداری به بررسی سریع‌تر کمک می‌کند.",
    },
    {
      slug: "saving-reward-follow-up",
      requestTypeCode: "SAVINGS",
      title: "پاداش صرفه‌جویی را چگونه پیگیری کنم؟",
      body: "برنامه صرفه‌جویی مربوط، دوره مصرف و شناسه قبض یا دارایی را انتخاب کنید و اختلاف محاسبه‌شده را در شرح درخواست بنویسید.",
    },
    {
      slug: "support-quality-complaint",
      requestTypeCode: "SUPPORT_COMPLAINT",
      title: "چطور از نتیجه یک درخواست شکایت کنم؟",
      body: "شماره درخواست قبلی را انتخاب و روشن توضیح دهید کدام بخش نتیجه یا نحوه پاسخ‌گویی رضایت‌بخش نبوده است. شکایت به صف کنترل کیفیت پشتیبانی ارسال می‌شود.",
    },
  ];
  const knowledgeKeywordsByRequestType = new Map([
    ["ACCOUNT_ACCESS", ["ورود", "لاگین", "رمز", "پسورد", "گذرواژه", "حساب", "اکانت"]],
    ["APP_ERROR", ["خطا", "ارور", "اپلیکیشن", "مرورگر", "صفحه", "خرابی"]],
    ["COMPANY_ACCESS", ["شرکت", "سازمان", "نماینده", "عضویت", "دسترسی"]],
    ["ELECTRICITY_SALE", ["تسویه", "فروش برق", "مطالبه", "پرداخت نیروگاه"]],
    ["CONTRACT", ["قرارداد", "الحاقیه", "امضا", "نماینده مجاز"]],
    ["INVOICE", ["صورتحساب", "فاکتور", "قبض", "مغایرت مالی"]],
    ["PAYMENT", ["پرداخت", "تراکنش", "واریز", "درگاه"]],
    ["METER", ["کنتور", "قرائت", "اندازه‌گیری", "مصرف"]],
    ["SAVINGS", ["صرفه‌جویی", "پاداش", "مصرف", "برنامه"]],
    ["SUPPORT_COMPLAINT", ["شکایت", "نارضایتی", "اعتراض", "پاسخ پشتیبانی"]],
  ]);
  let publicVersion = null;
  for (const definition of publicKnowledgeDefinitions) {
    const requestType = await transaction.supportRequestType.findUnique({
      where: { code: definition.requestTypeCode },
      select: { id: true, serviceId: true },
    });
    if (!requestType) {
      throw new Error(`${definition.requestTypeCode} request type is missing`);
    }
    const article = await transaction.knowledgeArticle.create({
      data: {
        slug: definition.slug,
        audience: "PUBLIC",
        status: "DRAFT",
        serviceId: requestType.serviceId,
        requestTypeId: requestType.id,
        searchKeywords: JSON.stringify(
          knowledgeKeywordsByRequestType.get(definition.requestTypeCode) ?? []
        ),
      },
    });
    const version = await transaction.knowledgeArticleVersion.create({
      data: {
        articleId: article.id,
        version: 1,
        title: definition.title,
        body: definition.body,
        approvalStatus: "APPROVED",
        approvedAt: new Date(),
        publishedAt: new Date(),
        contentChecksum: createHash("sha256")
          .update(`${definition.title}\n${definition.body}`)
          .digest("hex"),
      },
    });
    await transaction.knowledgeArticle.update({
      where: { id: article.id },
      data: { status: "ACTIVE", publishedVersionId: version.id },
    });
    publicVersion ??= version;
  }
  if (!publicVersion) throw new Error("Public knowledge article seed is missing");
  await transaction.predefinedMessage.createMany({
    data: [
      { title: "اعلام شروع بررسی", shortCode: "review-started", content: "درخواست شما دریافت شد و در حال بررسی تخصصی است." },
      { title: "درخواست اطلاعات تکمیلی", shortCode: "need-details", content: "برای ادامه بررسی، لطفاً اطلاعات و مستندات تکمیلی خواسته‌شده را ارسال کنید." },
      { title: "اعلام نتیجه", shortCode: "resolution-proposed", content: "بررسی درخواست انجام شد. لطفاً نتیجه را مشاهده و تأیید کنید." },
      { title: "اطلاع‌رسانی SLA", shortCode: "sla-update", content: "درخواست شما در اولویت پیگیری قرار دارد و نتیجه در همین گفتگو اعلام می‌شود." },
    ],
  });
  return {
    compatibilityDepartment,
    compatibilitySubDepartment,
    publicKnowledgeArticleVersion: publicVersion,
  };
}

function legacyStatus(lifecycleStatus) {
  if (lifecycleStatus === "CLOSED") return "CLOSED";
  if (["NEW", "UNASSIGNED"].includes(lifecycleStatus)) return "OPEN";
  return "IN_PROGRESS";
}

function adminNotificationMessage(definition, ticketId, queueName) {
  if (definition.lifecycleStatus === "REOPENED") {
    return `تیکت ${ticketId} توسط مشتری بازگشایی شد و نیازمند پیگیری است.`;
  }
  if (["NEW", "UNASSIGNED"].includes(definition.lifecycleStatus)) {
    return `تیکت جدید ${ticketId} در صف «${queueName}» منتظر تخصیص است.`;
  }
  if (definition.slaMode === "BREACHED") {
    return `هشدار نقض SLA برای تیکت ${ticketId} در صف «${queueName}» ثبت شد.`;
  }
  if (definition.lifecycleStatus === "WAITING_INTERNAL") {
    return `تیکت ${ticketId} منتظر اقدام تیم داخلی است.`;
  }
  if (definition.lifecycleStatus === "WAITING_USER") {
    return `برای تیکت ${ticketId} درخواست اطلاعات تکمیلی از مشتری ثبت شد.`;
  }
  if (definition.lifecycleStatus === "RESOLVED") {
    return `راهکار تیکت ${ticketId} ثبت شد و منتظر تأیید مشتری است.`;
  }
  if (definition.lifecycleStatus === "CLOSED") {
    return `تیکت ${ticketId} با موفقیت بسته شد.`;
  }
  return `تیکت ${ticketId} در صف «${queueName}» نیازمند پیگیری کارشناس است.`;
}

function ticketExamples() {
  const workflowExamples = [
    { code: "ACCOUNT_ACCESS", subject: "ورود ناموفق پس از تغییر رمز", message: "پس از تغییر رمز عبور امکان ورود به حساب را ندارم.", lifecycleStatus: "UNASSIGNED", ageDays: 2, slaMode: "BREACHED" },
    { code: "APP_ERROR", subject: "خطا در نمایش جزئیات صورتحساب", message: "در نسخه وب هنگام بازکردن جزئیات صورتحساب صفحه خطا نمایش داده می‌شود.", lifecycleStatus: "IN_PROGRESS", ageDays: 1, rootCause: "در حال بررسی لاگ‌های رابط کاربری", normalizedRootCauseCode: "APP_FRONTEND_DEFECT", referenceType: "APP_VERSION", referenceKey: "WEB-2026.09" },
    { code: "COMPANY_ACCESS", subject: "افزودن نماینده جدید شرکت", message: "برای همکار جدید دسترسی مشاهده قرارداد درخواست دارم.", lifecycleStatus: "WAITING_USER", ageDays: 3, referenceType: "ORGANIZATION_MEMBERSHIP", referenceKey: "ORG-DEMO-001", organization: true },
    { code: "ELECTRICITY_SALE", subject: "پیگیری تسویه فروش برق مرداد", message: "تسویه فروش برق مرداد هنوز در گزارش مالی ثبت نشده است.", lifecycleStatus: "WAITING_INTERNAL", ageDays: 4, referenceType: "SETTLEMENT", referenceKey: "SET-DEMO-1405-05", organization: true },
    { code: "CONTRACT", subject: "اصلاح نام نماینده در قرارداد", message: "نام نماینده مجاز در نسخه جدید قرارداد نیاز به اصلاح دارد.", lifecycleStatus: "INTERNAL_REFERRAL", ageDays: 2, referenceType: "CONTRACT", referenceKey: "CTR-DEMO-1405-001", organization: true },
    { code: "INVOICE", subject: "مغایرت مبلغ صورتحساب شهریور", message: "مبلغ صورتحساب با گزارش مصرف سازمان تطابق ندارد.", lifecycleStatus: "IN_PROGRESS", ageDays: 1, referenceType: "INVOICE", referenceKey: "INV-DEMO-1405-06", organization: true },
    { code: "PAYMENT", subject: "پرداخت موفق و وضعیت نامشخص", message: "وجه از حساب کسر شده اما وضعیت پرداخت هنوز نامشخص است.", lifecycleStatus: "RESOLVED", ageDays: 5, referenceType: "PAYMENT", referenceKey: "PAY-DEMO-88201", organization: true, resolutionSummary: "تراکنش با درگاه تطبیق داده شد و وضعیت پرداخت اصلاح شد." },
    { code: "POWER_PLANT", subject: "عدم به‌روزرسانی تولید نیروگاه", message: "آمار تولید امروز نیروگاه خورشیدی در پنل به‌روزرسانی نشده است.", lifecycleStatus: "IN_PROGRESS", ageDays: 1, referenceType: "POWER_PLANT", referenceKey: "PLANT-DEMO-YAZD-01", organization: true },
    { code: "METER", subject: "مغایرت قرائت کنتور", message: "عدد قرائت ثبت‌شده با تصویر کنتور مطابقت ندارد.", lifecycleStatus: "REOPENED", ageDays: 6, referenceType: "METER", referenceKey: "MTR-DEMO-4402", organization: true, resolutionSummary: "قرائت اصلاح شد؛ مشتری برای بررسی دوباره درخواست را باز کرد." },
    { code: "SAVINGS", subject: "محاسبه نشدن پاداش صرفه‌جویی", message: "با کاهش مصرف، پاداش دوره جاری در حساب نمایش داده نشده است.", lifecycleStatus: "CLOSED", ageDays: 10, referenceType: "SAVING_PROGRAM", referenceKey: "SAVE-DEMO-SUMMER", organization: true, resolutionSummary: "پاداش پس از تطبیق مصرف محاسبه و به کیف اعتبار افزوده شد." },
    { code: "SUPPORT_COMPLAINT", subject: "تاخیر در پاسخ‌گویی درخواست قبلی", message: "درخواست قبلی بدون اطلاع‌رسانی کافی با تأخیر پاسخ داده شد.", lifecycleStatus: "NEW", ageDays: 0, referenceType: "RELATED_TICKET", referenceKey: "TK-DEMO-0004", referenceLabel: "TK-DEMO-0004 — پیگیری تسویه فروش برق مرداد", rootCause: "نیازمند بررسی سرپرست", normalizedRootCauseCode: "SUPPORT_PROCESS_GAP" },
  ];

  const historicalRequestTypes = [
    "APP_ERROR",
    "PAYMENT",
    "INVOICE",
    "ELECTRICITY_SALE",
    "CONTRACT",
    "POWER_PLANT",
    "METER",
    "SAVINGS",
  ];
  const historicalExamples = Array.from({ length: 36 }, (_, index) => {
    const code = historicalRequestTypes[index % historicalRequestTypes.length];
    const appError = code === "APP_ERROR";
    const breached = index % 6 === 0;
    const reopened = index % 9 === 0;
    const rating = [5, 4, 5, 3, 4, 5, 2, 4, 5][index % 9];
    return {
      code,
      subject: appError
        ? `کندی تکرارشونده صفحه پرداخت — نمونه ${index + 1}`
        : `درخواست تکمیل‌شده گزارش مدیریتی — نمونه ${index + 1}`,
      message: appError
        ? "صفحه پرداخت در ساعات پرترافیک با تأخیر بارگذاری می‌شود."
        : "این درخواست برای نمایش کامل شاخص‌های عملیاتی در محیط ارائه ثبت شده است.",
      lifecycleStatus: reopened ? "REOPENED" : "CLOSED",
      ageDays: 9 + (index % 22),
      slaMode: breached ? "BREACHED" : "MET",
      responseMinutes: breached ? 360 : 20 + (index % 5) * 15,
      resolutionMinutes: breached ? 3_000 : 180 + (index % 8) * 90,
      rating,
      hasCustomerReplyAfterFirstResponse: index % 7 === 0,
      transferCount: index % 11 === 0 ? 1 : 0,
      collaborationCount: index % 13 === 0 ? 1 : 0,
      rootCause: appError ? "کندی سرویس پرداخت در ساعات پرترافیک" : null,
      normalizedRootCauseCode: appError ? "APP_FRONTEND_DEFECT" : null,
      incidentKey: appError ? "INC-DEMO-PAYMENT-SLOWNESS" : null,
      resolutionSummary: "درخواست بررسی و نتیجه نهایی به مشتری اعلام شد.",
      ...(code === "PAYMENT"
        ? {
            referenceType: "PAYMENT",
            referenceKey: `PAY-DEMO-HISTORY-${String(index + 1).padStart(3, "0")}`,
            organization: true,
          }
        : {}),
    };
  });

  const recurringExamples = Array.from({ length: 8 }, (_, index) => ({
    code: "APP_ERROR",
    subject: `کندی تکرارشونده صفحه پرداخت — رخداد اخیر ${index + 1}`,
    message: "صفحه پرداخت در بازه پرترافیک با کندی قابل توجه مواجه شده است.",
    lifecycleStatus: index % 3 === 0 ? "RESOLVED" : "IN_PROGRESS",
    ageDays: 1 + (index % 6),
    slaMode: index === 0 ? "BREACHED" : "MET",
    responseMinutes: index === 0 ? 180 : 15 + index * 5,
    resolutionMinutes: 180 + index * 30,
    rootCause: "کندی سرویس پرداخت در ساعات پرترافیک",
    normalizedRootCauseCode: "APP_FRONTEND_DEFECT",
    incidentKey: "INC-DEMO-PAYMENT-SLOWNESS",
    resolutionSummary:
      index % 3 === 0
        ? "ظرفیت سرویس افزایش یافت و زمان پاسخ به حالت پایدار بازگشت."
        : null,
  }));

  return [...workflowExamples, ...historicalExamples, ...recurringExamples];
}

async function appendSeedReportingEvent(transaction, context) {
  const eventId = randomUUID();
  const ticketEvent = await transaction.ticketEvent.create({
    data: {
      eventId,
      ticketId: context.ticket.id,
      type: context.type,
      schemaVersion: 1,
      aggregateVersion: context.aggregateVersion,
      visibility: context.visibility ?? "INTERNAL",
      fromStatus: context.fromStatus ?? null,
      toStatus: context.toStatus ?? null,
      actorType: context.actorType,
      sourceType: context.sourceType ?? "HUMAN",
      actorUserId: context.actorUserId ?? null,
      reason: context.reason ?? null,
      metadata: context.attributes ?? undefined,
      createdAt: context.occurredAt,
    },
  });
  const payload = {
    eventId,
    eventType: context.type,
    aggregateType: "TICKET",
    aggregateId: context.ticket.ticketId,
    aggregateVersion: context.aggregateVersion,
    schemaVersion: 1,
    occurredAt: context.occurredAt.toISOString(),
    actor: {
      type: context.actorType,
      id: context.actorUserId ? String(context.actorUserId) : null,
    },
    sourceType: context.sourceType ?? "HUMAN",
    scope: {
      partyId: String(context.targetParty.id),
      organizationId: context.organizationId
        ? String(context.organizationId)
        : null,
    },
    correlationId: null,
    causationId: null,
    payload: {
      fromStatus: context.fromStatus ?? null,
      toStatus: context.toStatus ?? null,
      dimensions: context.dimensions,
      attributes: context.attributes ?? {},
    },
  };
  const outbox = await transaction.outboxEvent.create({
    data: {
      eventId,
      ticketEventId: ticketEvent.id,
      aggregateType: "TICKET",
      aggregateId: context.ticket.ticketId,
      eventType: context.type,
      schemaVersion: 1,
      payload,
      occurredAt: context.occurredAt,
      availableAt: context.occurredAt,
      publishedAt: context.occurredAt,
    },
  });
  await transaction.reportingProcessedEvent.create({
    data: {
      eventId,
      outboxEventId: outbox.id,
      aggregateType: "TICKET",
      aggregateId: context.ticket.ticketId,
      aggregateVersion: context.aggregateVersion,
      eventType: context.type,
      occurredAt: context.occurredAt,
      processedAt: new Date(),
      definitionVersion: KPI_DEFINITION_VERSION,
      outcome: "APPLIED",
    },
  });
  return { eventId, outboxId: outbox.id };
}

async function createTicketExample(transaction, context) {
  const {
    definition,
    index,
    customer,
    customerParty,
    organization,
    organizationParty,
    compatibility,
    catalog,
    sla,
    owner,
    rootCauseByCode,
  } = context;
  const requestDefinition = requestTypeDefinitions.find((item) => item.code === definition.code);
  const requestType = catalog.requestTypeByCode.get(definition.code);
  const team = catalog.teamByCode.get(requestDefinition.teamCode);
  const queue = catalog.queueByCode.get(requestDefinition.queueCode);
  const policy = sla.policyByPriority.get(requestDefinition.priority);
  const route = sla.routeByRequestTypeCode.get(definition.code);
  const createdAt = daysAgo(definition.ageDays);
  const slaStartedAt = createdAt;
  const targetParty = definition.organization ? organizationParty : customerParty;
  const firstResponseDueAt = minutesFrom(slaStartedAt, policy.firstResponseMinutes);
  const resolutionDueAt = minutesFrom(slaStartedAt, policy.resolutionMinutes);
  const hasStaffResponse = !["NEW", "UNASSIGNED"].includes(definition.lifecycleStatus);
  const hasPublicStaffResponse =
    hasStaffResponse && definition.lifecycleStatus !== "WAITING_INTERNAL";
  const hasResolution = ["RESOLVED", "CLOSED", "REOPENED"].includes(
    definition.lifecycleStatus
  );
  const hasClosure = ["CLOSED", "REOPENED"].includes(
    definition.lifecycleStatus
  );
  const isWaitingUser = definition.lifecycleStatus === "WAITING_USER";
  const responseMinutes = definition.responseMinutes ?? 45;
  const resolutionMinutes = definition.resolutionMinutes ?? 240;
  const firstRespondedAt = hasPublicStaffResponse
    ? minutesFrom(createdAt, responseMinutes)
    : null;
  const firstResolvedAt = hasResolution
    ? minutesFrom(createdAt, resolutionMinutes)
    : null;
  const firstClosedAt = hasClosure
    ? minutesFrom(createdAt, resolutionMinutes + 30)
    : null;
  const reopenedAt = definition.lifecycleStatus === "REOPENED"
    ? minutesFrom(firstClosedAt, 60)
    : null;
  const firstResponseState = definition.slaMode === "BREACHED"
    ? "BREACHED"
    : hasPublicStaffResponse
      ? responseMinutes <= policy.firstResponseMinutes ? "MET" : "BREACHED"
      : "PENDING";
  const resolutionState = definition.slaMode === "BREACHED"
    ? "BREACHED"
    : hasResolution
      ? resolutionMinutes <= policy.resolutionMinutes ? "MET" : "BREACHED"
      : isWaitingUser
        ? "PAUSED"
        : "PENDING";
  const publicId = `TK-DEMO-${String(index + 1).padStart(4, "0")}`;
  const normalizedRootCause = definition.normalizedRootCauseCode
    ? rootCauseByCode.get(definition.normalizedRootCauseCode)
    : null;
  const ticket = await transaction.ticket.create({
    data: {
      ticketId: publicId,
      subject: definition.subject,
      message: definition.message,
      status: legacyStatus(definition.lifecycleStatus),
      lifecycleStatus: definition.lifecycleStatus,
      priority: requestDefinition.priority,
      routeVersion: 1,
      userName: `${customer.firstName} ${customer.lastName}`.trim(),
      departmentId: compatibility.compatibilityDepartment.id,
      subDepartmentId: compatibility.compatibilitySubDepartment.id,
      userId: customer.id,
      createdById: customer.id,
      partyId: targetParty.id,
      organizationId: definition.organization ? organization.id : null,
      requestTypeId: requestType.id,
      supportTeamId: team.id,
      queueId: queue.id,
      ownerUserId: ["NEW", "UNASSIGNED"].includes(definition.lifecycleStatus) ? null : owner.id,
      rootCause: definition.rootCause ?? null,
      normalizedRootCauseId: normalizedRootCause?.id ?? null,
      resolutionSummary: definition.resolutionSummary ?? null,
      actionTaken: hasResolution
        ? definition.resolutionSummary ?? "بررسی تخصصی انجام و مشکل ثبت‌شده برطرف شد."
        : null,
      finalResponse: hasResolution
        ? definition.resolutionSummary ?? "نتیجه نهایی رسیدگی به مشتری اعلام شد."
        : null,
      rating: definition.rating ?? null,
      closedBy: definition.lifecycleStatus === "CLOSED" ? "CUSTOMER" : null,
      closedReason: definition.lifecycleStatus === "CLOSED" ? "تأیید نتیجه توسط مشتری" : null,
      closedAt: definition.lifecycleStatus === "CLOSED" ? firstClosedAt : null,
      createdAt,
      updatedAt: minutesFrom(createdAt, Math.min(definition.ageDays * 120 + 30, 600)),
    },
  });
  await transaction.ticketAssignment.create({
    data: {
      ticketId: ticket.id,
      supportTeamId: team.id,
      queueId: queue.id,
      ownerUserId: ["NEW", "UNASSIGNED"].includes(definition.lifecycleStatus) ? null : owner.id,
      assignedById: owner.id,
      reason: "مسیریابی خودکار بر اساس نوع درخواست",
      activeKey: String(ticket.id),
      startedAt: createdAt,
    },
  });
  await transaction.ticketMessage.create({
    data: {
      ticketId: ticket.id,
      visibility: "PUBLIC",
      authorType: "CUSTOMER",
      actorUserId: customer.id,
      authorPartyId: targetParty.id,
      authorSnapshot: `${customer.firstName} ${customer.lastName}`.trim(),
      body: definition.message,
      sourceType: "NATIVE",
      createdAt,
    },
  });
  if (hasStaffResponse) {
    await transaction.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        visibility: definition.lifecycleStatus === "WAITING_INTERNAL" ? "INTERNAL" : "PUBLIC",
        authorType: "STAFF",
        actorUserId: owner.id,
        authorSnapshot: `${owner.firstName} ${owner.lastName}`.trim(),
        body: hasResolution
          ? definition.resolutionSummary
          : isWaitingUser
            ? "لطفاً معرفی‌نامه نماینده و محدوده دسترسی موردنظر را ارسال کنید."
            : "درخواست در صف تخصصی قرار گرفت و نتیجه بررسی در همین گفتگو اعلام می‌شود.",
        sourceType: "NATIVE",
        createdAt: minutesFrom(createdAt, responseMinutes),
      },
    });
  }
  if (definition.hasCustomerReplyAfterFirstResponse && firstRespondedAt) {
    await transaction.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        visibility: "PUBLIC",
        authorType: "CUSTOMER",
        actorUserId: customer.id,
        authorPartyId: targetParty.id,
        authorSnapshot: `${customer.firstName} ${customer.lastName}`.trim(),
        body: "اطلاعات تکمیلی درخواستی ارسال شد.",
        sourceType: "NATIVE",
        createdAt: minutesFrom(firstRespondedAt, 15),
      },
    });
  }
  const ticketSla = await transaction.ticketSla.create({
    data: {
      ticketId: ticket.id,
      policyId: policy.id,
      calendarId: policy.calendarId,
      policyCode: policy.code,
      policyVersion: policy.version,
      calendarCode: policy.calendarId ? sla.calendar.code : null,
      calendarVersion: policy.calendarId ? sla.calendar.version : null,
      clockType: policy.clockType,
      firstResponseMinutes: policy.firstResponseMinutes,
      resolutionMinutes: policy.resolutionMinutes,
      enforcementMode: "ENFORCED",
      firstResponseState,
      resolutionState,
      resolutionEscalationLevel: definition.slaMode === "BREACHED" ? "SUPERVISOR" : "NONE",
      startedAt: slaStartedAt,
      resolutionCycleStartedAt: slaStartedAt,
      firstResponseWarning70At: minutesFrom(slaStartedAt, Math.round(policy.firstResponseMinutes * 0.7)),
      firstResponseWarning90At: minutesFrom(slaStartedAt, Math.round(policy.firstResponseMinutes * 0.9)),
      firstResponseDueAt,
      resolutionWarning70At: minutesFrom(slaStartedAt, Math.round(policy.resolutionMinutes * 0.7)),
      resolutionWarning90At: minutesFrom(slaStartedAt, Math.round(policy.resolutionMinutes * 0.9)),
      resolutionDueAt,
      resolutionManagerAt: minutesFrom(slaStartedAt, Math.round(policy.resolutionMinutes * 1.25)),
      firstRespondedAt,
      resolvedAt: firstResolvedAt,
      pausedAt: isWaitingUser ? minutesFrom(createdAt, 60) : null,
    },
  });
  if (isWaitingUser) {
    await transaction.ticketSlaPause.create({
      data: {
        ticketSlaId: ticketSla.id,
        reason: "WAITING_USER",
        startedAt: minutesFrom(createdAt, 60),
        activeKey: String(ticket.id),
      },
    });
  }
  await transaction.routingDecision.create({
    data: {
      ticketId: ticket.id,
      routeId: route.id,
      requestTypeId: requestType.id,
      supportTeamId: team.id,
      queueId: queue.id,
      slaPolicyId: policy.id,
      source: "CATALOG",
      ruleCode: "PRODUCT_CATALOG_ROUTE",
      ruleVersion: 1,
      routeVersion: 1,
      priority: requestDefinition.priority,
      reason: "مسیریابی بر اساس نوع درخواست منتخب مشتری",
      inputSnapshot: { requestTypeCode: definition.code, organizationContext: Boolean(definition.organization) },
      createdAt,
    },
  });
  if (definition.referenceType) {
    await transaction.ticketBusinessReference.create({
      data: {
        ticketId: ticket.id,
        organizationId: definition.organization ? organization.id : null,
        referenceType: definition.referenceType,
        referenceKey: definition.referenceKey,
        displayLabel: definition.referenceLabel ?? definition.referenceKey,
        verificationStatus: "VERIFIED",
        sourceSystem: REPORTING_PROVIDER_CODE,
        entityType: definition.referenceType,
        externalId: definition.referenceKey,
        snapshotFetchedAt: createdAt,
      },
    });
  }
  if (definition.lifecycleStatus === "WAITING_INTERNAL") {
    const legalTeam = catalog.teamByCode.get("LEGAL");
    const legalQueue = catalog.queueByCode.get("CONTRACT_REVIEW");
    await transaction.ticketWorkItem.create({
      data: {
        ticketId: ticket.id,
        supportTeamId: legalTeam.id,
        queueId: legalQueue.id,
        assignedUserId: owner.id,
        requestedById: owner.id,
        request: "لطفاً بند تسویه قرارداد را برای پاسخ نهایی بررسی کنید.",
        status: "OPEN",
        createdAt: minutesFrom(createdAt, 90),
      },
    });
  }
  if (hasResolution) {
    const proposedAt = firstResolvedAt;
    const isClosed = definition.lifecycleStatus === "CLOSED";
    const isReopened = definition.lifecycleStatus === "REOPENED";
    await transaction.ticketResolutionCycle.create({
      data: {
        ticketId: ticket.id,
        sequence: 1,
        proposedAt,
        reminderOneAt: minutesFrom(proposedAt, 60 * 24),
        reminderTwoAt: minutesFrom(proposedAt, 60 * 48),
        autoCloseAt: minutesFrom(proposedAt, 60 * 72),
        reminderCount: isClosed ? 2 : 0,
        outcome: isClosed ? "CONFIRMED" : isReopened ? "REJECTED" : "PENDING",
        activeKey: definition.lifecycleStatus === "RESOLVED" ? String(ticket.id) : null,
        closedAt: isClosed ? firstClosedAt : isReopened ? reopenedAt : null,
      },
    });
  }
  if (["WAITING_USER", "RESOLVED"].includes(definition.lifecycleStatus)) {
    await transaction.notification.create({
      data: {
        ticketId: ticket.id,
        userId: customer.id,
        recipientType: "USER",
        message: definition.lifecycleStatus === "WAITING_USER" ? "برای ادامه بررسی، پاسخ شما لازم است." : "راهکار درخواست ثبت شد؛ لطفاً نتیجه را تأیید کنید.",
      },
    });
  }
  await transaction.notification.create({
    data: {
      ticketId: ticket.id,
      recipientType: "ADMIN",
      message: adminNotificationMessage(definition, ticket.ticketId, queue.name),
      isRead:
        definition.lifecycleStatus === "CLOSED" ||
        (!["NEW", "UNASSIGNED", "REOPENED"].includes(definition.lifecycleStatus) &&
          index % 5 === 0),
      createdAt:
        reopenedAt ??
        firstClosedAt ??
        firstResolvedAt ??
        minutesFrom(createdAt, Math.min(responseMinutes, 120)),
    },
  });
  const ownerUserId = ["NEW", "UNASSIGNED"].includes(
    definition.lifecycleStatus
  )
    ? null
    : owner.id;
  const fcrMaturesAt = firstClosedAt
    ? new Date(firstClosedAt.getTime() + FCR_WINDOW_MILLISECONDS)
    : null;
  const reopenedWithinWindow = definition.lifecycleStatus === "REOPENED";
  const fcrFailed = Boolean(
    reopenedWithinWindow ||
      definition.hasCustomerReplyAfterFirstResponse ||
      definition.transferCount ||
      definition.collaborationCount
  );
  const fcrStatus = !firstClosedAt
    ? "EXCLUDED"
    : fcrMaturesAt > new Date()
      ? "PENDING_WINDOW"
      : fcrFailed
        ? "NOT_ACHIEVED"
        : "ACHIEVED";
  const dimensions = {
    snapshotStatus: "COMPLETE",
    partyType: definition.organization ? "ORGANIZATION" : "INDIVIDUAL",
    legacyImported: false,
    channel: "WEB",
    priority: requestDefinition.priority,
    routeVersion: 1,
    ownerUserId: ownerUserId ? String(ownerUserId) : null,
    rootCauseRecorded: Boolean(definition.rootCause),
    partyKeyHash: hashReportingParty(targetParty.id),
    normalizedRootCause: normalizedRootCause
      ? {
          id: String(normalizedRootCause.id),
          code: normalizedRootCause.code,
          name: normalizedRootCause.name,
        }
      : null,
    incidentKey: definition.incidentKey ?? null,
    service: {
      id: String(requestType.serviceId),
      code: requestDefinition.serviceCode,
      name: catalog.serviceByCode.get(requestDefinition.serviceCode).name,
    },
    requestType: {
      id: String(requestType.id),
      code: requestDefinition.code,
      name: requestType.name,
    },
    supportTeam: { id: String(team.id), code: team.code, name: team.name },
    queue: { id: String(queue.id), code: queue.code, name: queue.name },
    slaPolicy: {
      code: policy.code,
      version: policy.version,
      clockType: policy.clockType,
      enforcementMode: "ENFORCED",
      startedAt: slaStartedAt.toISOString(),
      firstResponseDueAt: firstResponseDueAt.toISOString(),
      resolutionDueAt: resolutionDueAt.toISOString(),
      firstResponseState,
      resolutionState,
    },
  };
  const eventDefinitions = [
    {
      type: "ticket.created.v1",
      occurredAt: createdAt,
      actorType: "USER",
      actorUserId: customer.id,
      visibility: "PUBLIC",
      toStatus: "NEW",
      reason: "ثبت درخواست از درگاه پشتیبانی",
      attributes: { requestTypeCode: definition.code, routeVersion: 1 },
    },
    ...(firstRespondedAt
      ? [{
          type: "ticket.public_message_added.v1",
          occurredAt: firstRespondedAt,
          actorType: "STAFF",
          actorUserId: owner.id,
          visibility: "PUBLIC",
          attributes: { source: "demo-seed" },
        }]
      : []),
    ...(definition.hasCustomerReplyAfterFirstResponse && firstRespondedAt
      ? [{
          type: "ticket.public_message_added.v1",
          occurredAt: minutesFrom(firstRespondedAt, 15),
          actorType: "USER",
          actorUserId: customer.id,
          visibility: "PUBLIC",
          attributes: { source: "demo-seed" },
        }]
      : []),
    ...(definition.transferCount
      ? [{
          type: "ticket.transferred.v1",
          occurredAt: minutesFrom(createdAt, responseMinutes + 30),
          actorType: "STAFF",
          actorUserId: owner.id,
          attributes: { routeVersion: 1 },
        }]
      : []),
    ...(definition.collaborationCount
      ? [{
          type: "ticket.collaborator_added.v1",
          occurredAt: minutesFrom(createdAt, responseMinutes + 45),
          actorType: "STAFF",
          actorUserId: owner.id,
          attributes: { primaryOwnerPreserved: true },
        }]
      : []),
    ...(!firstRespondedAt && firstResponseState === "BREACHED"
      ? [{
          type: "sla.breached.v1",
          occurredAt: minutesFrom(firstResponseDueAt, 1),
          actorType: "SYSTEM",
          sourceType: "AUTOMATION",
          attributes: { target: "FIRST_RESPONSE", enforcementMode: "ENFORCED" },
        }]
      : []),
    ...(firstResolvedAt
      ? [{
          type: "ticket.resolved.v1",
          occurredAt: firstResolvedAt,
          actorType: "STAFF",
          actorUserId: owner.id,
          fromStatus: "IN_PROGRESS",
          toStatus: "RESOLVED",
        }]
      : []),
    ...(!firstResolvedAt && resolutionState === "BREACHED"
      ? [{
          type: "sla.breached.v1",
          occurredAt: minutesFrom(resolutionDueAt, 1),
          actorType: "SYSTEM",
          sourceType: "AUTOMATION",
          attributes: { target: "RESOLUTION", enforcementMode: "ENFORCED" },
        }]
      : []),
    ...(firstClosedAt
      ? [{
          type: "ticket.closed.v1",
          occurredAt: firstClosedAt,
          actorType: "USER",
          actorUserId: customer.id,
          fromStatus: "RESOLVED",
          toStatus: "CLOSED",
          attributes: { source: "customer-confirmation" },
        }]
      : []),
    ...(definition.rating && firstClosedAt
      ? [{
          type: "ticket.rated.v1",
          occurredAt: minutesFrom(firstClosedAt, 15),
          actorType: "USER",
          actorUserId: customer.id,
          attributes: { rating: definition.rating, source: "customer" },
        }]
      : []),
    ...(reopenedAt
      ? [{
          type: "ticket.reopened.v1",
          occurredAt: reopenedAt,
          actorType: "USER",
          actorUserId: customer.id,
          fromStatus: "CLOSED",
          toStatus: "REOPENED",
          attributes: { source: "customer" },
        }]
      : []),
  ].sort((left, right) => left.occurredAt - right.occurredAt);
  let lastEvent = null;
  for (const [eventIndex, eventDefinition] of eventDefinitions.entries()) {
    lastEvent = await appendSeedReportingEvent(transaction, {
      ...eventDefinition,
      aggregateVersion: eventIndex + 1,
      ticket,
      targetParty,
      organizationId: definition.organization ? organization.id : null,
      dimensions,
    });
    if (eventIndex === 0) {
      await transaction.outboxDelivery.create({
        data: {
          outboxEventId: lastEvent.outboxId,
          consumer: "SLA_ROUTING_V1",
          status: "SUCCEEDED",
          processedAt: new Date(),
        },
      });
    }
  }
  const lastEventDefinition = eventDefinitions.at(-1);
  await transaction.ticket.update({
    where: { id: ticket.id },
    data: {
      version: eventDefinitions.length,
      updatedAt: lastEventDefinition.occurredAt,
    },
  });
  await transaction.ticketReportingFact.create({
    data: {
      ticketId: ticket.id,
      definitionVersion: KPI_DEFINITION_VERSION,
      sourceAggregateVersion: eventDefinitions.length,
      sourceLastEventId: lastEvent.eventId,
      ticketCreatedAt: createdAt,
      slaStartedAt,
      firstResponseDueAt,
      resolutionDueAt,
      firstHumanPublicResponseAt: firstRespondedAt,
      firstResponseEffectiveMilliseconds: firstRespondedAt
        ? durationMilliseconds(responseMinutes)
        : null,
      firstResolvedAt,
      resolutionEffectiveMilliseconds: firstResolvedAt
        ? durationMilliseconds(resolutionMinutes)
        : null,
      firstClosedAt,
      lastClosedAt: firstClosedAt,
      fcrMaturesAt,
      fcrStatus,
      firstResponseSlaState: firstResponseState,
      resolutionSlaState: resolutionState,
      reopenedWithinWindow: firstClosedAt ? reopenedWithinWindow : null,
      reopenCount: reopenedWithinWindow ? 1 : 0,
      reopenWithinWindowEventCount: reopenedWithinWindow ? 1 : 0,
      customerReopenWithinWindowCount: reopenedWithinWindow ? 1 : 0,
      publicStaffMessageCount: firstRespondedAt ? 1 : 0,
      publicCustomerMessageCount: definition.hasCustomerReplyAfterFirstResponse ? 1 : 0,
      transferCount: definition.transferCount ?? 0,
      collaborationCount: definition.collaborationCount ?? 0,
      hasCustomerReplyAfterFirstResponse:
        definition.hasCustomerReplyAfterFirstResponse ?? false,
      rating: definition.rating ?? null,
      ratedAt:
        definition.rating && firstClosedAt
          ? minutesFrom(firstClosedAt, 15)
          : null,
      serviceId: requestType.serviceId,
      serviceCode: requestDefinition.serviceCode,
      serviceName: catalog.serviceByCode.get(requestDefinition.serviceCode).name,
      requestTypeId: requestType.id,
      requestTypeCode: requestType.code,
      requestTypeName: requestType.name,
      supportTeamId: team.id,
      supportTeamCode: team.code,
      supportTeamName: team.name,
      queueId: queue.id,
      queueCode: queue.code,
      queueName: queue.name,
      ownerUserId,
      organizationId: definition.organization ? organization.id : null,
      partyType: definition.organization ? "ORGANIZATION" : "PERSON",
      partyKeyHash: hashReportingParty(targetParty.id),
      normalizedRootCauseId: normalizedRootCause?.id ?? null,
      normalizedRootCauseCode: normalizedRootCause?.code ?? null,
      normalizedRootCauseName: normalizedRootCause?.name ?? null,
      incidentKey: definition.incidentKey ?? null,
      priorityAtCreation: requestDefinition.priority,
      priorityAtResolution: firstResolvedAt ? requestDefinition.priority : null,
      channel: "WEB",
      slaPolicyCode: policy.code,
      slaPolicyVersion: policy.version,
      legacyImported: false,
      dataQualityStatus: "HEALTHY",
    },
  });
  return ticket;
}

async function seedTickets(transaction, users, parties, compatibility, catalog, sla, rootCauseByCode) {
  const customers = users.filter((user) => user.role === "USER");
  const ownerMobiles = new Set(
    demoAccounts
      .filter((account) => account.supportTeamCodes?.includes("*"))
      .map((account) => account.mobile)
  );
  const owners = users.filter((user) => ownerMobiles.has(user.mobile));
  if (customers.length === 0 || owners.length === 0) {
    throw new Error("At least one customer and one team-scoped support owner are required");
  }
  const examples = ticketExamples();
  const seededTickets = [];
  for (const [index, definition] of examples.entries()) {
    const customer = customers[index % customers.length];
    const ticket = await createTicketExample(transaction, {
      definition,
      index,
      customer,
      customerParty: parties.personPartyByUserId.get(customer.id),
      organization: parties.organization,
      organizationParty: parties.organizationParty,
      compatibility,
      catalog,
      sla,
      owner: owners[index % owners.length],
      rootCauseByCode,
    });
    seededTickets.push(ticket);
  }
  return seededTickets;
}

async function seedB2bServicePlanAndIncident(transaction, users, parties, catalog, seededTickets) {
  const accountManagerMobile = demoAccounts.find((account) => account.key === "account-manager")?.mobile;
  const accountManager = users.find((user) => user.mobile === accountManagerMobile);
  const contractRequestType = catalog.requestTypeByCode.get("CONTRACT");
  if (!accountManager || !contractRequestType) {
    throw new Error("B2B demo prerequisites are missing");
  }
  const plan = await transaction.organizationServicePlan.create({
    data: {
      organizationId: parties.organization.id,
      contractReferenceKey: "CTR-DEMO-1405-001",
      requestTypeId: contractRequestType.id,
      name: "سطح خدمت طلایی قرارداد انرژی آفتاب",
      firstResponseMinutes: 30,
      resolutionMinutes: 480,
      accountManagerUserId: accountManager.id,
      validFrom: daysAgo(365),
      status: "ACTIVE",
    },
  });
  const contractTicket = seededTickets[4];
  await transaction.ticket.update({
    where: { id: contractTicket.id },
    data: {
      servicePlanId: plan.id,
      resolutionSummary: "نسخه اصلاحی قرارداد آماده و برای کنترل نهایی مدیر حساب ارسال شده است.",
    },
  });
  await transaction.ticketAccountReview.create({
    data: {
      ticketId: contractTicket.id,
      accountManagerUserId: accountManager.id,
      status: "PENDING",
      requestedAt: daysAgo(1),
    },
  });
  await transaction.ticketSla.update({
    where: { ticketId: contractTicket.id },
    data: {
      firstResponseMinutes: 30,
      resolutionMinutes: 480,
      firstResponseDueAt: minutesFrom(contractTicket.createdAt, 30),
      resolutionDueAt: minutesFrom(contractTicket.createdAt, 480),
    },
  });

  const affectedTickets = seededTickets.slice(-8);
  const affectedPartyIds = [...new Set(affectedTickets.map((ticket) => ticket.partyId).filter(Boolean))];
  await transaction.supportIncident.create({
    data: {
      incidentKey: "INC-DEMO-PAYMENT-SLOWNESS",
      title: "کندی عمومی صفحه پرداخت در ساعات پرترافیک",
      description: "پایش سامانه افزایش زمان پاسخ صفحه پرداخت را برای چند کاربر تشخیص داده است.",
      sourceType: "EXTERNAL_MONITOR",
      sourceReference: "monitor:payment-latency:p95",
      status: "INVESTIGATING",
      severity: "HIGH",
      requestTypeId: catalog.requestTypeByCode.get("APP_ERROR")?.id,
      serviceCode: "IDENTITY_ACCESS",
      createdByUserId: accountManager.id,
      initialNotice: "اختلال شناسایی شده و تیم فنی در حال رفع علت مشترک است؛ نیازی به ثبت تیکت جدید نیست.",
      initialNoticeAt: new Date(),
      impacts: {
        create: affectedPartyIds.map((partyId) => ({
          partyId,
          displayLabel: [...parties.personPartyByUserId.values()].find((party) => party.id === partyId)?.displayName ?? "مشتری تحت تأثیر",
          notifiedAt: new Date(),
        })),
      },
      ticketLinks: { create: affectedTickets.map((ticket) => ({ ticketId: ticket.id })) },
    },
  });
}

async function seedDemoSupportJourneys(
  transaction,
  users,
  parties,
  catalog,
  compatibility,
  seededTickets
) {
  const customers = users.filter((user) => user.role === "USER");
  const requestType = catalog.requestTypeByCode.get("ACCOUNT_ACCESS");
  const team = catalog.teamByCode.get("CUSTOMER_AFFAIRS");
  const articleVersion = compatibility.publicKnowledgeArticleVersion;
  const rows = Array.from({ length: 12 }, (_, index) => {
    const customer = customers[index % customers.length];
    const customerParty = parties.personPartyByUserId.get(customer.id);
    const startedAt = daysAgo(2 + index * 2);
    const contentShownAt = minutesFrom(startedAt, 1);
    const conversionDeadlineAt = minutesFrom(startedAt, 30);
    const confirmed = index < 6;
    const converted = index >= 6 && index < 9;
    return {
      id: randomUUID(),
      definitionVersion: KPI_DEFINITION_VERSION,
      partyKeyHash: hashReportingParty(customerParty.id),
      serviceId: requestType.serviceId,
      serviceCode: "IDENTITY_ACCESS",
      requestTypeId: requestType.id,
      requestTypeCode: requestType.code,
      supportTeamId: team.id,
      channel: "WEB",
      status: confirmed
        ? "CONFIRMED_RESOLVED"
        : converted
          ? "CONVERTED_TO_TICKET"
          : "CONTENT_SHOWN",
      contentType: "KNOWLEDGE_ARTICLE",
      contentReference: "recover-account-access",
      customerQuestion: index % 2 === 0
        ? "بعد از تغییر رمز چرا نمی‌توانم وارد حساب شوم؟"
        : "چطور دسترسی حسابم را بازیابی کنم؟",
      contentIsPublicApprovedActive: true,
      knowledgeArticleVersionId: articleVersion.id,
      startedAt,
      contentShownAt,
      confirmedResolvedAt: confirmed ? minutesFrom(startedAt, 8) : null,
      conversionDeadlineAt,
      humanInterventionAt: !confirmed && !converted
        ? minutesFrom(startedAt, 12)
        : null,
      convertedTicketId: converted
        ? seededTickets[6 + index].id
        : null,
      outcomeFinalizedAt: confirmed || converted
        ? minutesFrom(startedAt, 15)
        : null,
    };
  });
  await transaction.supportJourney.createMany({ data: rows });
  await transaction.supportJourneyMessage.createMany({
    data: rows.flatMap((row) => [
      {
        journeyId: row.id,
        author: "CUSTOMER",
        kind: "QUESTION",
        body: row.customerQuestion,
        createdAt: row.startedAt,
      },
      {
        journeyId: row.id,
        author: "SYSTEM",
        kind: "GUIDANCE",
        body: articleVersion.body,
        createdAt: row.contentShownAt,
      },
    ]),
  });
  return rows.length;
}

async function seedDemoTransactionVolumes(transaction, organization) {
  const today = reportingLocalDate();
  const rows = [];
  for (let offset = 1; offset <= 100; offset += 1) {
    const localDate = shiftLocalDate(today, -offset);
    const nextLocalDate = shiftLocalDate(localDate, 1);
    for (const [typeIndex, transactionType] of TRANSACTION_TYPES.entries()) {
      const successfulTransactionCount = BigInt(
        700 + typeIndex * 90 + (offset % 11) * 13
      );
      for (const scope of [
        { scopeType: "GLOBAL", scopeKey: "*", organizationId: null, ratio: 1 },
        {
          scopeType: "ORGANIZATION",
          scopeKey: String(organization.id),
          organizationId: organization.id,
          ratio: 0.35,
        },
      ]) {
        const scopedSuccessfulCount = BigInt(
          Math.max(1, Math.round(Number(successfulTransactionCount) * scope.ratio))
        );
        const checksumSource = [
          REPORTING_PROVIDER_CODE,
          transactionType,
          localDate,
          scope.scopeType,
          scope.scopeKey,
          scopedSuccessfulCount,
        ].join(":");
        rows.push({
          providerCode: REPORTING_PROVIDER_CODE,
          transactionType,
          localDate: new Date(`${localDate}T00:00:00.000Z`),
          bucketStartedAt: tehranMidnight(localDate),
          bucketEndedAt: tehranMidnight(nextLocalDate),
          timeZone: REPORTING_TIME_ZONE,
          scopeType: scope.scopeType,
          scopeKey: scope.scopeKey,
          organizationId: scope.organizationId,
          successfulTransactionCount: scopedSuccessfulCount,
          totalTransactionCount: scopedSuccessfulCount + BigInt(20 + typeIndex),
          sourceVersion: "DEMO-2026.09-V1",
          sourceChecksum: createHash("sha256").update(checksumSource).digest("hex"),
          status: "VERIFIED",
        });
      }
    }
  }
  await transaction.transactionVolumeDaily.createMany({ data: rows });
  return rows.length;
}

async function seedDemoRecurringProblemSignal(
  transaction,
  catalog,
  rootCauseByCode
) {
  const windowEndedAt = tehranMidnight(reportingLocalDate());
  const windowStartedAt = tehranMidnight(
    shiftLocalDate(reportingLocalDate(), -7)
  );
  const baselineStartedAt = tehranMidnight(
    shiftLocalDate(reportingLocalDate(), -35)
  );
  const rootCause = rootCauseByCode.get("APP_FRONTEND_DEFECT");
  const requestType = catalog.requestTypeByCode.get("APP_ERROR");
  const service = catalog.serviceByCode.get("IDENTITY_ACCESS");
  const groupKey = `${service.code}:${requestType.code}:CAUSE:${rootCause.id}`;
  const signalKey = createHash("sha256")
    .update(
      `${KPI_DEFINITION_VERSION}:${windowStartedAt.toISOString()}:${windowEndedAt.toISOString()}:${groupKey}`
    )
    .digest("hex");
  const currentFacts = await transaction.ticketReportingFact.findMany({
    where: {
      ticketCreatedAt: { gte: windowStartedAt, lt: windowEndedAt },
      serviceId: service.id,
      requestTypeId: requestType.id,
      normalizedRootCauseId: rootCause.id,
      dataQualityStatus: "HEALTHY",
    },
    select: { partyKeyHash: true },
  });
  const baselineTicketCount = await transaction.ticketReportingFact.count({
    where: {
      ticketCreatedAt: { gte: baselineStartedAt, lt: windowStartedAt },
      serviceId: service.id,
      requestTypeId: requestType.id,
      normalizedRootCauseId: rootCause.id,
      dataQualityStatus: "HEALTHY",
    },
  });
  const distinctPartyCount = new Set(
    currentFacts.map((fact) => fact.partyKeyHash).filter(Boolean)
  ).size;
  await transaction.recurringProblemSignal.create({
    data: {
      signalKey,
      definitionVersion: KPI_DEFINITION_VERSION,
      windowStartedAt,
      windowEndedAt,
      baselineStartedAt,
      baselineEndedAt: windowStartedAt,
      serviceId: service.id,
      serviceCode: service.code,
      serviceName: service.name,
      requestTypeId: requestType.id,
      requestTypeCode: requestType.code,
      requestTypeName: requestType.name,
      normalizedRootCauseId: rootCause.id,
      ticketCount: currentFacts.length,
      distinctPartyCount,
      eligibleCauseTicketCount: currentFacts.length,
      baselineWeeklyAverage: baselineTicketCount / 4,
      growthPercent: baselineTicketCount > 0
        ? ((currentFacts.length * 4 - baselineTicketCount) * 100) /
          baselineTicketCount
        : null,
      status:
        currentFacts.length >= 5 && distinctPartyCount >= 3
          ? "RECURRING"
          : "BELOW_THRESHOLD",
      generatedAt: new Date(),
    },
  });
  return 1;
}

async function seedReportingProjectionCheckpoint(transaction) {
  const lastOutboxEvent = await transaction.outboxEvent.findFirst({
    where: { aggregateType: "TICKET" },
    orderBy: { id: "desc" },
    select: { id: true, eventId: true, occurredAt: true },
  });
  if (!lastOutboxEvent) {
    throw new Error("Reporting projection checkpoint requires source events");
  }
  await transaction.reportingProjectionCheckpoint.create({
    data: {
      consumerName: REPORTING_PROJECTION_CONSUMER,
      definitionVersion: KPI_DEFINITION_VERSION,
      status: "HEALTHY",
      lastOutboxEventId: lastOutboxEvent.id,
      lastEventId: lastOutboxEvent.eventId,
      lastEventOccurredAt: lastOutboxEvent.occurredAt,
      lastProcessedAt: new Date(),
      rebuildStartedAt: new Date(),
      rebuildCompletedAt: new Date(),
      failureCount: 0,
    },
  });
}

async function verifySeed(transaction, expectedUserCount, expectedFingerprint) {
  const users = await transaction.user.findMany({ orderBy: { id: "asc" } });
  const allTeamStaffCount = demoAccounts.filter(
    (account) => account.supportTeamCodes?.includes("*")
  ).length;
  const [
    tickets,
    services,
    requestTypes,
    teams,
    queues,
    organizations,
    rootCauses,
    kpiDefinitionVersions,
    supportTeamMemberships,
    missingCore,
    missingMessages,
    missingAssignments,
    healthyFacts,
    ratedFacts,
    achievedFcrFacts,
    missedFcrFacts,
    reopenedFacts,
    metSlaFacts,
    breachedSlaFacts,
    supportJourneys,
    transactionVolumes,
    recurringSignals,
    sourceEvents,
    processedEvents,
    checkpoint,
    adminNotifications,
    unreadAdminNotifications,
    readAdminNotifications,
  ] = await Promise.all([
    transaction.ticket.count(),
    transaction.supportService.count(),
    transaction.supportRequestType.count(),
    transaction.supportTeam.count(),
    transaction.supportQueue.count(),
    transaction.organization.count(),
    transaction.reportingRootCauseDimension.count({ where: { status: "ACTIVE" } }),
    transaction.kpiDefinitionVersion.count({
      where: {
        version: KPI_DEFINITION_VERSION,
        status: "ACTIVE",
        activeKey: "SUPPORT_KPI",
        contractHash: KPI_CONTRACT_HASH,
      },
    }),
    transaction.userRoleAssignment.count({
      where: {
        user: { role: "ADMIN" },
        role: { key: { in: ["SUPPORT_AGENT", "SUPERVISOR"] } },
        supportTeam: { status: "ACTIVE" },
        scopeType: "SUPPORT_TEAM",
        status: "ACTIVE",
      },
    }),
    transaction.ticket.count({ where: { OR: [{ lifecycleStatus: null }, { requestTypeId: null }, { supportTeamId: null }, { queueId: null }, { partyId: null }] } }),
    transaction.ticket.count({ where: { messages: { none: {} } } }),
    transaction.ticket.count({ where: { assignments: { none: { endedAt: null } } } }),
    transaction.ticketReportingFact.count({ where: { dataQualityStatus: "HEALTHY" } }),
    transaction.ticketReportingFact.count({ where: { rating: { not: null } } }),
    transaction.ticketReportingFact.count({ where: { fcrStatus: "ACHIEVED" } }),
    transaction.ticketReportingFact.count({ where: { fcrStatus: "NOT_ACHIEVED" } }),
    transaction.ticketReportingFact.count({ where: { reopenedWithinWindow: true } }),
    transaction.ticketReportingFact.count({
      where: { firstResponseSlaState: "MET", resolutionSlaState: "MET" },
    }),
    transaction.ticketReportingFact.count({
      where: {
        OR: [
          { firstResponseSlaState: "BREACHED" },
          { resolutionSlaState: "BREACHED" },
        ],
      },
    }),
    transaction.supportJourney.count(),
    transaction.transactionVolumeDaily.count({ where: { status: "VERIFIED" } }),
    transaction.recurringProblemSignal.count({ where: { status: "RECURRING" } }),
    transaction.outboxEvent.count({ where: { aggregateType: "TICKET" } }),
    transaction.reportingProcessedEvent.count({
      where: { aggregateType: "TICKET" },
    }),
    transaction.reportingProjectionCheckpoint.findUnique({
      where: { consumerName: REPORTING_PROJECTION_CONSUMER },
    }),
    transaction.notification.count({ where: { recipientType: "ADMIN" } }),
    transaction.notification.count({
      where: { recipientType: "ADMIN", isRead: false },
    }),
    transaction.notification.count({
      where: { recipientType: "ADMIN", isRead: true },
    }),
  ]);
  if (users.length !== expectedUserCount || fingerprintUsers(users) !== expectedFingerprint) {
    throw new Error("Demo user verification failed");
  }
  if (missingCore || missingMessages || missingAssignments) {
    throw new Error("Seed integrity verification failed");
  }
  if (kpiDefinitionVersions !== 1) {
    throw new Error("KPI reporting contract verification failed");
  }
  if (rootCauses !== rootCauseDefinitions.length) {
    throw new Error("Root-cause taxonomy verification failed");
  }
  const expectedSupportTeamMemberships = allTeamStaffCount * teams;
  if (supportTeamMemberships !== expectedSupportTeamMemberships) {
    throw new Error("Demo support-team membership verification failed");
  }
  if (
    adminNotifications !== tickets ||
    unreadAdminNotifications === 0 ||
    readAdminNotifications === 0
  ) {
    throw new Error("Admin notification demo coverage verification failed");
  }
  if (
    healthyFacts !== tickets ||
    ratedFacts < 30 ||
    achievedFcrFacts === 0 ||
    missedFcrFacts === 0 ||
    reopenedFacts === 0 ||
    metSlaFacts === 0 ||
    breachedSlaFacts === 0 ||
    supportJourneys === 0 ||
    transactionVolumes === 0 ||
    recurringSignals === 0
  ) {
    throw new Error("Reporting demo coverage verification failed");
  }
  if (
    sourceEvents !== processedEvents ||
    !checkpoint ||
    checkpoint.status !== "HEALTHY" ||
    checkpoint.lastOutboxEventId === null
  ) {
    throw new Error("Reporting projection consistency verification failed");
  }
  return {
    users: users.length,
    tickets,
    services,
    requestTypes,
    teams,
    queues,
    organizations,
    rootCauses,
    kpiDefinitionVersions,
    supportTeamMemberships,
    notifications: {
      admin: adminNotifications,
      adminUnread: unreadAdminNotifications,
      adminRead: readAdminNotifications,
    },
    reporting: {
      healthyFacts,
      ratedFacts,
      achievedFcrFacts,
      missedFcrFacts,
      reopenedFacts,
      metSlaFacts,
      breachedSlaFacts,
      supportJourneys,
      transactionVolumes,
      recurringSignals,
      sourceEvents,
      processedEvents,
    },
  };
}

async function main() {
  assertSafeDemoResetTarget({
    environment: process.env,
    argumentsList: process.argv.slice(2),
  });
  const demoUserRows = await buildDemoUserRows();
  const summary = await prisma.$transaction(async (transaction) => {
    await deleteNonUserData(transaction);
    const demoUsers = await replaceUsersWithDemoAccounts(
      transaction,
      demoUserRows
    );
    const demoUserFingerprint = fingerprintUsers(demoUsers);
    await seedReportingContract(transaction);
    const authorization = await seedAuthorization(transaction, demoUsers);
    const parties = await seedPartiesAndOrganizations(transaction, demoUsers);
    const catalog = await seedCatalog(transaction);
    const rootCauseByCode = await seedRootCauseDimensions(transaction);
    await seedDemoSupportTeamMemberships(
      transaction,
      demoUsers,
      catalog,
      authorization.roleByKey
    );
    const sla = await seedSlaAndRoutes(transaction, catalog);
    const compatibility = await seedCompatibilityAndKnowledge(transaction);
    const seededTickets = await seedTickets(
      transaction,
      demoUsers,
      parties,
      compatibility,
      catalog,
      sla,
      rootCauseByCode
    );
    await seedB2bServicePlanAndIncident(
      transaction,
      demoUsers,
      parties,
      catalog,
      seededTickets
    );
    await seedDemoSupportJourneys(
      transaction,
      demoUsers,
      parties,
      catalog,
      compatibility,
      seededTickets
    );
    await seedDemoTransactionVolumes(transaction, parties.organization);
    await seedDemoRecurringProblemSignal(
      transaction,
      catalog,
      rootCauseByCode
    );
    await seedReportingProjectionCheckpoint(transaction);
    return verifySeed(
      transaction,
      demoUsers.length,
      demoUserFingerprint
    );
  }, { maxWait: 15_000, timeout: 120_000 });
  console.log(JSON.stringify({ ok: true, demoUsersSeeded: true, ...summary }));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, event: "product_data_reset_failed", errorType: error instanceof Error ? error.name : "UnknownError", message: error instanceof Error ? error.message : "Unknown error" }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
