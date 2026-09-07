import { formatDate, formatFileSize, formatRelativeTime, toPersianDigits } from "@/lib/format";

describe("format utilities", () => {
  describe("formatDate", () => {
    it("should format date string to Persian format", () => {
      const date = "2024-01-15T10:30:00.000Z";
      const result = formatDate(date);
      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
    });

    it("should handle invalid date gracefully", () => {
      const invalidDate = "invalid-date";
      const result = formatDate(invalidDate);
      expect(result).toBeDefined();
    });
  });

  describe("formatRelativeTime", () => {
    it("should return 'همین الان' for recent times", () => {
      const now = new Date();
      const result = formatRelativeTime(now.toISOString());
      expect(result).toBe("همین الان");
    });

    it("should return minutes ago for times within the hour", () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const result = formatRelativeTime(fiveMinutesAgo.toISOString());
      expect(result).toContain("دقیقه پیش");
    });

    it("should return hours ago for times within the day", () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const result = formatRelativeTime(twoHoursAgo.toISOString());
      expect(result).toContain("ساعت پیش");
    });

    it("should return days ago for older times", () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const result = formatRelativeTime(threeDaysAgo.toISOString());
      expect(result).toContain("روز پیش");
    });
  });

  describe("formatFileSize", () => {
    it("should format bytes correctly", () => {
      expect(formatFileSize(0)).toBe("۰ بایت");
      expect(formatFileSize(100)).toBe("۱۰۰ بایت");
    });

    it("should format kilobytes correctly", () => {
      const result1 = formatFileSize(1024);
      const result2 = formatFileSize(1536);
      expect(result1).toContain("کیلوبایت");
      expect(result2).toContain("کیلوبایت");
    });

    it("should format megabytes correctly", () => {
      const result1 = formatFileSize(1048576);
      const result2 = formatFileSize(2097152);
      expect(result1).toContain("مگابایت");
      expect(result2).toContain("مگابایت");
    });
  });

  describe("toPersianDigits", () => {
    it("should convert numbers to Persian digits", () => {
      expect(toPersianDigits(123)).toBe("۱۲۳");
      expect(toPersianDigits(456)).toBe("۴۵۶");
      expect(toPersianDigits(789)).toBe("۷۸۹");
      expect(toPersianDigits(0)).toBe("۰");
    });

    it("should convert strings to Persian digits", () => {
      expect(toPersianDigits("123")).toBe("۱۲۳");
      expect(toPersianDigits("456")).toBe("۴۵۶");
      expect(toPersianDigits("789")).toBe("۷۸۹");
      expect(toPersianDigits("0")).toBe("۰");
    });

    it("should handle mixed content", () => {
      expect(toPersianDigits("abc123xyz")).toBe("abc۱۲۳xyz");
      expect(toPersianDigits("test456")).toBe("test۴۵۶");
    });
  });
});
