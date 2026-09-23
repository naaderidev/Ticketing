import {
  isProtectedApiPath,
  isProtectedPagePath,
  resolvePostLoginRedirect,
} from "@/lib/route-access-policy";

describe("route access policy", () => {
  it.each([
    "/admin",
    "/admin/tickets",
    "/user",
    "/user/tickets",
    "/user/tickets/TK-1",
  ])("protects page path %s", (pathname) => {
    expect(isProtectedPagePath(pathname)).toBe(true);
  });

  it.each(["/", "/user/login", "/user/signup", "/user-login"])(
    "keeps page path %s public",
    (pathname) => {
      expect(isProtectedPagePath(pathname)).toBe(false);
    }
  );

  it.each([
    "/api/tickets",
    "/api/tickets/TK-1",
    "/api/departments",
    "/api/subdepartments/1",
    "/api/faq/reorder",
    "/api/messages",
    "/api/notifications/read-all",
    "/api/upload",
    "/api/attachments/42",
  ])("protects API path %s", (pathname) => {
    expect(isProtectedApiPath(pathname)).toBe(true);
  });

  it.each([
    "/api/users/login",
    "/api/users/signup",
    "/api/tickets-public",
    "/api/subdepartments-public",
  ])("does not over-match API path %s", (pathname) => {
    expect(isProtectedApiPath(pathname)).toBe(false);
  });
});

describe("post-login redirects", () => {
  it("preserves an internal protected route and its query", () => {
    expect(
      resolvePostLoginRedirect("/user/tickets?page=2", "/user")
    ).toBe("/user/tickets?page=2");
  });

  it.each([
    "https://attacker.example/steal",
    "//attacker.example/steal",
    "/\\attacker.example/steal",
    "javascript:alert(1)",
    "/user/login",
  ])("rejects unsafe or public redirect target %s", (candidate) => {
    expect(resolvePostLoginRedirect(candidate, "/user")).toBe("/user");
  });

  it("uses the role-specific fallback when no target is provided", () => {
    expect(resolvePostLoginRedirect(null, "/admin")).toBe("/admin");
  });
});
