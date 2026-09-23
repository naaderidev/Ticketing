import {
  normalizePersianText,
  scoreKnowledgeCandidate,
} from "@/modules/knowledge/domain/persian-knowledge-search";

const accountArticle = {
  title: "اگر وارد حسابم نشدم چه کنم؟",
  body: "شماره موبایل و رمز عبور را بررسی کنید و برای بازیابی دسترسی اقدام کنید.",
  keywords: ["ورود", "لاگین", "پسورد", "اکانت"],
  serviceName: "حساب کاربری",
  requestTypeName: "ورود و دسترسی",
};

describe("Persian knowledge search", () => {
  it("normalizes Arabic glyphs, Persian digits and half spaces", () => {
    expect(normalizePersianText("ورودِ كاربر ۱۲۳‌ تست")).toBe("ورود کاربر 123 تست");
  });

  it("matches Persian synonyms with high confidence", () => {
    const result = scoreKnowledgeCandidate(
      "پسورد اکانتم برای لاگین کار نمی کند",
      accountArticle
    );
    expect(result.confidence).toBe("HIGH");
    expect(result.score).toBeGreaterThanOrEqual(0.72);
  });

  it("tolerates one-character spelling mistakes in meaningful tokens", () => {
    const result = scoreKnowledgeCandidate("نمیتونم وارد اکاتم بشم", accountArticle);
    expect(result.score).toBeGreaterThanOrEqual(0.42);
  });

  it("keeps unrelated sensitive questions at low confidence", () => {
    const result = scoreKnowledgeCandidate(
      "مبلغ دقیق تسویه قرارداد نیروگاه من چقدر است",
      accountArticle
    );
    expect(result.confidence).toBe("LOW");
  });
});
