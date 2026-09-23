export type KnowledgeMatchConfidence = "HIGH" | "MEDIUM" | "LOW";

export type KnowledgeSearchCandidate = {
  title: string;
  body: string;
  keywords: readonly string[];
  serviceName: string | null;
  requestTypeName: string | null;
};

export type KnowledgeSearchMatch = {
  score: number;
  confidence: KnowledgeMatchConfidence;
  reasons: string[];
};

const STOP_WORDS = new Set([
  "از",
  "به",
  "با",
  "برای",
  "در",
  "را",
  "که",
  "این",
  "آن",
  "یک",
  "من",
  "ما",
  "و",
  "یا",
  "چطور",
  "چگونه",
  "چی",
  "چه",
  "است",
  "هستم",
  "هست",
  "شد",
  "شده",
  "کنم",
  "کنید",
  "می",
  "نمی",
  "کار",
  "کند",
  "کنه",
  "نمیتونم",
  "میتونم",
  "بشم",
  "بشه",
]);

const SYNONYM_GROUPS = [
  ["ورود", "وارد", "لاگین", "login", "دسترسی"],
  ["رمز", "پسورد", "گذرواژه", "password"],
  ["حساب", "اکانت", "پروفایل"],
  ["پرداخت", "تراکنش", "واریز", "درگاه"],
  ["صورتحساب", "فاکتور", "قبض"],
  ["قرارداد", "توافقنامه", "الحاقیه"],
  ["شرکت", "سازمان", "حقوقی"],
  ["نماینده", "عضو", "کاربر سازمانی"],
  ["کنتور", "قرائت", "اندازه گیری", "اندازه‌گیری"],
  ["نیروگاه", "تولید", "برق"],
  ["تسویه", "مطالبه", "بستانکاری"],
  ["خطا", "ارور", "اشکال", "مشکل", "خرابی"],
  ["شکایت", "نارضایتی", "اعتراض"],
] as const;

const SYNONYMS = new Map<string, ReadonlySet<string>>();
for (const group of SYNONYM_GROUPS) {
  const normalizedGroup = new Set(group.map((item) => normalizePersianText(item)));
  for (const item of normalizedGroup) SYNONYMS.set(item, normalizedGroup);
}

const DIGIT_MAP: Readonly<Record<string, string>> = {
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

export function normalizePersianText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[۰-۹٠-٩]/g, (digit) => DIGIT_MAP[digit] ?? digit)
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ۀة]/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/إ|أ/g, "ا")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[\u200C\u200D]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("fa");
}

function meaningfulTokens(value: string): string[] {
  return normalizePersianText(value)
    .split(" ")
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function editDistanceAtMostOne(left: string, right: string): boolean {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  if (left.length < 4 || right.length < 4) return false;

  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  return edits + Number(leftIndex < left.length || rightIndex < right.length) <= 1;
}

function tokenMatches(queryToken: string, candidateTokens: ReadonlySet<string>): boolean {
  const stemmedQueryToken =
    queryToken.length > 4 && /[متی]$/.test(queryToken)
      ? queryToken.slice(0, -1)
      : queryToken;
  const alternatives = new Set([
    queryToken,
    stemmedQueryToken,
    ...(SYNONYMS.get(queryToken) ?? []),
    ...(SYNONYMS.get(stemmedQueryToken) ?? []),
  ]);
  for (const alternative of alternatives) {
    if (candidateTokens.has(alternative)) return true;
    for (const candidateToken of candidateTokens) {
      if (editDistanceAtMostOne(alternative, candidateToken)) return true;
    }
  }
  return false;
}

function confidenceFor(score: number): KnowledgeMatchConfidence {
  if (score >= 0.72) return "HIGH";
  if (score >= 0.42) return "MEDIUM";
  return "LOW";
}

export function scoreKnowledgeCandidate(
  question: string,
  candidate: KnowledgeSearchCandidate
): KnowledgeSearchMatch {
  const normalizedQuestion = normalizePersianText(question);
  const queryTokens = [...new Set(meaningfulTokens(question))];
  if (!normalizedQuestion || queryTokens.length === 0) {
    return { score: 0, confidence: "LOW", reasons: [] };
  }

  const normalizedTitle = normalizePersianText(candidate.title);
  const normalizedBody = normalizePersianText(candidate.body);
  const normalizedKeywords = normalizePersianText(candidate.keywords.join(" "));
  const normalizedScope = normalizePersianText(
    [candidate.serviceName, candidate.requestTypeName].filter(Boolean).join(" ")
  );
  const searchableTokens = new Set(
    meaningfulTokens(
      `${candidate.title} ${candidate.body} ${candidate.keywords.join(" ")} ${normalizedScope}`
    )
  );

  const matchedTokens = queryTokens.filter((token) => tokenMatches(token, searchableTokens));
  const coverage = matchedTokens.length / queryTokens.length;
  let score = coverage * 0.62;
  const reasons: string[] = [];

  if (normalizedTitle.includes(normalizedQuestion)) {
    score += 0.28;
    reasons.push("تطابق مستقیم با عنوان راهنما");
  } else if (matchedTokens.some((token) => normalizedTitle.includes(token))) {
    score += 0.12;
    reasons.push("تطابق با واژه‌های عنوان");
  }
  if (normalizedKeywords && queryTokens.some((token) => normalizedKeywords.includes(token))) {
    score += 0.12;
    reasons.push("تطابق با کلیدواژه‌های تأییدشده");
  }
  if (normalizedScope && queryTokens.some((token) => normalizedScope.includes(token))) {
    score += 0.08;
    reasons.push("تطابق با خدمت یا نوع درخواست");
  }
  if (normalizedBody.includes(normalizedQuestion)) {
    score += 0.1;
    reasons.push("تطابق مستقیم با متن راهنما");
  }
  if (coverage === 1) reasons.push("پوشش همه واژه‌های اصلی سؤال");

  const boundedScore = Math.min(1, Number(score.toFixed(3)));
  return {
    score: boundedScore,
    confidence: confidenceFor(boundedScore),
    reasons: [...new Set(reasons)],
  };
}
