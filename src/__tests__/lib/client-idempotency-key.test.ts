import { createClientIdempotencyKey } from "@/lib/client-idempotency-key";

const SAFE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;

describe("client idempotency key", () => {
  it("uses randomUUID when the browser provides it", () => {
    const randomUUID = jest.fn(() => "018f1f69-7f21-7d0b-a844-4cc3ea22e630");

    expect(createClientIdempotencyKey({ randomUUID })).toBe(
      "018f1f69-7f21-7d0b-a844-4cc3ea22e630"
    );
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it("creates a valid UUID when randomUUID is unavailable", () => {
    const getRandomValues = jest.fn((bytes: Uint8Array) => {
      bytes.set(Array.from({ length: 16 }, (_, index) => index));
      return bytes;
    });

    const key = createClientIdempotencyKey({ getRandomValues });

    expect(key).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
    expect(key).toMatch(SAFE_KEY_PATTERN);
  });

  it("keeps HTTP demo environments functional without Web Crypto", () => {
    const key = createClientIdempotencyKey(null);

    expect(key).toMatch(SAFE_KEY_PATTERN);
  });
});
