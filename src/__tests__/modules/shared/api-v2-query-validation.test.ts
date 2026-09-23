import { z } from "zod";
import { parseApiV2Query } from "@/modules/shared/api-v2-validation";

describe("api v2 query validation", () => {
  const schema = z
    .object({ limit: z.coerce.number().int().positive().default(25) })
    .strict();

  it("rejects duplicate and unknown query parameters", () => {
    const request = new Request("http://localhost");
    expect(
      parseApiV2Query(request, new URLSearchParams("limit=1&limit=2"), schema)
        .success
    ).toBe(false);
    expect(
      parseApiV2Query(request, new URLSearchParams("sort=asc"), schema).success
    ).toBe(false);
  });

  it("coerces a valid query", () => {
    const request = new Request("http://localhost");
    expect(
      parseApiV2Query(request, new URLSearchParams("limit=10"), schema)
    ).toEqual({ success: true, data: { limit: 10 } });
  });
});
