import {
  loginSchema,
  createUserSchema,
  createTicketSchema,
  replySchema,
  ratingSchema,
  departmentSchema,
  subDepartmentSchema,
  faqSchema,
  predefinedMessageSchema,
} from "@/lib/validations";

describe("Validation Schemas", () => {
  describe("loginSchema", () => {
    it("should validate valid mobile number", () => {
      const validData = { mobile: "09121234567" };
      const result = loginSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject invalid mobile number", () => {
      const invalidData = { mobile: "1234567" };
      const result = loginSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject empty mobile", () => {
      const invalidData = { mobile: "" };
      const result = loginSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe("createUserSchema", () => {
    it("should validate valid user data", () => {
      const validData = {
        firstName: "علی",
        lastName: "احمدی",
        nationalCode: "1234567890",
        mobile: "09121234567",
        email: "test@example.com",
        birthday: "1400/01/01",
      };
      const result = createUserSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject invalid national code", () => {
      const invalidData = {
        firstName: "علی",
        lastName: "احمدی",
        nationalCode: "123",
        mobile: "09121234567",
        email: "test@example.com",
        birthday: "1400/01/01",
      };
      const result = createUserSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject invalid mobile", () => {
      const invalidData = {
        firstName: "علی",
        lastName: "احمدی",
        nationalCode: "1234567890",
        mobile: "1234567",
        email: "test@example.com",
        birthday: "1400/01/01",
      };
      const result = createUserSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject missing email", () => {
      const invalidData = {
        firstName: "علی",
        lastName: "احمدی",
        nationalCode: "1234567890",
        mobile: "09121234567",
      };
      const result = createUserSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject missing birthday", () => {
      const invalidData = {
        firstName: "علی",
        lastName: "احمدی",
        nationalCode: "1234567890",
        mobile: "09121234567",
        email: "test@example.com",
      };
      const result = createUserSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject non-Persian name", () => {
      const invalidData = {
        firstName: "Ali",
        lastName: "Ahmadi",
        nationalCode: "1234567890",
        mobile: "09121234567",
        email: "test@example.com",
        birthday: "1400/01/01",
      };
      const result = createUserSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe("createTicketSchema", () => {
    it("should validate valid ticket data", () => {
      const validData = {
        subject: "مشکل در سیستم",
        message: "متن پیام تستی",
        departmentId: "1",
        subDepartmentId: "1",
      };
      const result = createTicketSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject empty subject", () => {
      const invalidData = {
        subject: "",
        message: "متن پیام تستی",
        departmentId: "1",
        subDepartmentId: "1",
      };
      const result = createTicketSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject subject too long", () => {
      const invalidData = {
        subject: "a".repeat(201),
        message: "متن پیام تستی",
        departmentId: "1",
        subDepartmentId: "1",
      };
      const result = createTicketSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject message too long", () => {
      const invalidData = {
        subject: "مشکل در سیستم",
        message: "a".repeat(1001),
        departmentId: "1",
        subDepartmentId: "1",
      };
      const result = createTicketSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe("replySchema", () => {
    it("should validate valid reply", () => {
      const validData = { message: "پاسخ تستی" };
      const result = replySchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject empty message", () => {
      const invalidData = { message: "" };
      const result = replySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject message too long", () => {
      const invalidData = { message: "a".repeat(1001) };
      const result = replySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe("ratingSchema", () => {
    it("should validate valid rating", () => {
      const validData = { rating: 4 };
      const result = ratingSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject rating less than 1", () => {
      const invalidData = { rating: 0 };
      const result = ratingSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject rating more than 5", () => {
      const invalidData = { rating: 6 };
      const result = ratingSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe("departmentSchema", () => {
    it("should validate valid department name", () => {
      const validData = { name: "دپارتمان فنی" };
      const result = departmentSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject empty name", () => {
      const invalidData = { name: "" };
      const result = departmentSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe("subDepartmentSchema", () => {
    it("should validate valid sub-department name", () => {
      const validData = { name: "ساب‌دپارتمان فنی" };
      const result = subDepartmentSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject empty name", () => {
      const invalidData = { name: "" };
      const result = subDepartmentSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe("faqSchema", () => {
    it("should validate valid FAQ data", () => {
      const validData = {
        question: "سوال تستی",
        answer: "پاسخ تستی",
        departmentId: "1",
      };
      const result = faqSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject empty question", () => {
      const invalidData = {
        question: "",
        answer: "پاسخ تستی",
        departmentId: "1",
      };
      const result = faqSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject empty answer", () => {
      const invalidData = {
        question: "سوال تستی",
        answer: "",
        departmentId: "1",
      };
      const result = faqSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe("predefinedMessageSchema", () => {
    it("should validate valid message data", () => {
      const validData = {
        title: "پیام تستی",
        content: "محتوای تستی",
        shortCode: "test_message",
      };
      const result = predefinedMessageSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject invalid shortCode", () => {
      const invalidData = {
        title: "پیام تستی",
        content: "محتوای تستی",
        shortCode: "test message!",
      };
      const result = predefinedMessageSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should accept shortCode with numbers and underscore", () => {
      const validData = {
        title: "پیام تستی",
        content: "محتوای تستی",
        shortCode: "test_123_message",
      };
      const result = predefinedMessageSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });
});
