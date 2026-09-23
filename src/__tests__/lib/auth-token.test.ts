const mockJwtVerify = jest.fn();
const mockSign = jest.fn((_secret: Uint8Array) => {
  void _secret;
  return Promise.resolve("signed-session-token");
});
const mockSetSubject = jest.fn();

jest.mock("jose", () => ({
  SignJWT: class {
    setProtectedHeader() {
      return this;
    }
    setSubject(subject: string) {
      mockSetSubject(subject);
      return this;
    }
    setIssuer() {
      return this;
    }
    setAudience() {
      return this;
    }
    setIssuedAt() {
      return this;
    }
    setExpirationTime() {
      return this;
    }
    sign(secret: Uint8Array) {
      return mockSign(secret);
    }
  },
  jwtVerify: (...args: unknown[]) => mockJwtVerify(...args),
}));

import { signToken, verifyToken } from "@/lib/auth-token";

describe("session token", () => {
  const payload = {
    userId: 7,
    sessionId: "4f1cd431-0dbf-4c2d-854c-1de9d6058208",
  };

  it("signs only the user and database session identifiers", async () => {
    await expect(signToken(payload)).resolves.toBe("signed-session-token");
    expect(mockSetSubject).toHaveBeenCalledWith("7");
    expect(mockSign.mock.calls[0][0]).toHaveProperty("byteLength");
  });

  it("accepts a valid database session identity", async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: { sub: "7", sid: payload.sessionId },
    });

    await expect(verifyToken("valid-token")).resolves.toEqual(payload);
  });

  it("rejects invalid or unverifiable token payloads", async () => {
    mockJwtVerify
      .mockResolvedValueOnce({ payload: { sub: "7", sid: "not-a-uuid" } })
      .mockRejectedValueOnce(new Error("invalid signature"));

    await expect(verifyToken("bad-payload")).resolves.toBeNull();
    await expect(verifyToken("bad-signature")).resolves.toBeNull();
  });
});
