import {
  confirmKnowledgeResolutionSchema,
  createKnowledgeArticleSchema,
  publishKnowledgeArticleSchema,
  startKnowledgeJourneySchema,
} from "@/modules/knowledge/contracts/knowledge-schemas";
import { createTicketV2Schema } from "@/modules/tickets/contracts/ticket-schemas";

describe("automated-resolution contracts", () => {
  it("accepts a scoped public draft and rejects unknown fields", () => {
    expect(
      createKnowledgeArticleSchema.parse({
        slug: "recover-account-access",
        title: "بازیابی دسترسی",
        body: "مراحل بازیابی دسترسی به حساب",
        audience: "PUBLIC",
        requestTypeId: 1,
      })
    ).toMatchObject({ audience: "PUBLIC", requestTypeId: 1 });
    expect(() =>
      createKnowledgeArticleSchema.parse({
        slug: "recover-account-access",
        title: "بازیابی دسترسی",
        body: "مراحل بازیابی دسترسی به حساب",
        audience: "PUBLIC",
        published: true,
      })
    ).toThrow();
  });

  it("requires positive article and version identifiers", () => {
    expect(startKnowledgeJourneySchema.parse({ articleId: 1 })).toEqual({
      articleId: 1,
    });
    expect(publishKnowledgeArticleSchema.parse({ version: 1 })).toEqual({
      version: 1,
    });
    expect(() => startKnowledgeJourneySchema.parse({ articleId: 0 })).toThrow();
  });

  it("uses an explicit empty confirmation command", () => {
    expect(confirmKnowledgeResolutionSchema.parse({})).toEqual({});
    expect(() =>
      confirmKnowledgeResolutionSchema.parse({ resolved: true })
    ).toThrow();
  });

  it("allows a ticket to carry one validated support-journey attribution", () => {
    const value = createTicketV2Schema.parse({
      requestTypeId: 1,
      subject: "ورود به حساب",
      description: "پس از اجرای راهنما همچنان وارد حساب نمی‌شوم.",
      supportJourneyId: "d34f2ca7-ff15-4f37-a659-260b3d184adc",
    });
    expect(value.supportJourneyId).toBe(
      "d34f2ca7-ff15-4f37-a659-260b3d184adc"
    );
    expect(() =>
      createTicketV2Schema.parse({
        requestTypeId: 1,
        subject: "ورود به حساب",
        description: "شرح",
        supportJourneyId: "not-a-uuid",
      })
    ).toThrow();
  });
});
