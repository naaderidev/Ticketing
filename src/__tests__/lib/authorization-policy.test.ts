import {
  hasNotificationPermission,
  hasTicketPermission,
  TicketPermission,
} from "@/lib/authorization-policy";

const permissions: TicketPermission[] = [
  "read",
  "reply",
  "close",
  "manage",
  "delete",
  "rate",
];

describe("authorization policy", () => {
  describe("ticket permission matrix", () => {
    it.each(permissions)("applies the admin policy for %s", (permission) => {
      const allowed = hasTicketPermission(
        { id: 1, role: "ADMIN" },
        { userId: 2 },
        permission
      );

      expect(allowed).toBe(permission !== "rate");
    });

    it.each(permissions)("applies the owner policy for %s", (permission) => {
      const allowed = hasTicketPermission(
        { id: 1, role: "USER" },
        { userId: 1 },
        permission
      );

      expect(allowed).toBe(
        ["read", "reply", "close", "rate"].includes(permission)
      );
    });

    it.each(permissions)("denies a non-owner for %s", (permission) => {
      expect(
        hasTicketPermission(
          { id: 1, role: "USER" },
          { userId: 2 },
          permission
        )
      ).toBe(false);
    });
  });

  describe("notification permission matrix", () => {
    it("allows an admin to access admin notifications only", () => {
      const admin = { id: 1, role: "ADMIN" as const };

      expect(
        hasNotificationPermission(admin, {
          userId: null,
          recipientType: "ADMIN",
        })
      ).toBe(true);
      expect(
        hasNotificationPermission(admin, {
          userId: 2,
          recipientType: "USER",
        })
      ).toBe(false);
    });

    it("allows a user to access only their own user notifications", () => {
      const user = { id: 1, role: "USER" as const };

      expect(
        hasNotificationPermission(user, {
          userId: 1,
          recipientType: "USER",
        })
      ).toBe(true);
      expect(
        hasNotificationPermission(user, {
          userId: 2,
          recipientType: "USER",
        })
      ).toBe(false);
      expect(
        hasNotificationPermission(user, {
          userId: null,
          recipientType: "ADMIN",
        })
      ).toBe(false);
    });
  });
});
