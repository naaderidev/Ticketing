import { DomainError, rethrowPersistenceError } from "@/lib/domain-error";

describe("persistence error translation", () => {
  it.each([
    ["P2002", "duplicate", "CONFLICT"],
    ["P2003", "related", "CONFLICT"],
    ["P2025", "missing", "NOT_FOUND"],
  ])("maps %s to a typed domain error", (code, message, kind) => {
    let caught: unknown;
    try {
      rethrowPersistenceError(
        { code },
        { unique: "duplicate", foreignKey: "related", notFound: "missing" }
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DomainError);
    expect(caught).toMatchObject({ message, kind });
  });

  it("preserves unknown persistence failures", () => {
    const failure = { code: "P9999" };
    try {
      rethrowPersistenceError(failure, {});
      throw new Error("Expected persistence error to be rethrown");
    } catch (error) {
      expect(error).toBe(failure);
    }
  });
});
