import { errors, labels, titles, descriptions, buttons, placeholders } from "@/lib/strings";

describe("Strings", () => {
  describe("errors", () => {
    it("should have all error messages in Persian", () => {
      expect(errors.REQUIRED_FIELDS).toBeDefined();
      expect(errors.ALL_FIELDS_REQUIRED).toBeDefined();
      expect(errors.SERVER_ERROR).toBeDefined();
      expect(errors.USER_NOT_FOUND).toBeDefined();
      expect(errors.TICKET_NOT_FOUND).toBeDefined();
      expect(errors.DEPARTMENT_NOT_FOUND).toBeDefined();
    });

    it("should have consistent error message format", () => {
      Object.values(errors).forEach((value) => {
        expect(typeof value).toBe("string");
        expect(value.length).toBeGreaterThan(0);
      });
    });
  });

  describe("labels", () => {
    it("should have all status labels", () => {
      expect(labels.STATUS_OPEN).toBe("باز");
      expect(labels.STATUS_IN_PROGRESS).toBe("در حال بررسی");
      expect(labels.STATUS_CLOSED).toBe("بسته شده");
    });

    it("should have all navigation labels", () => {
      expect(labels.NAV_TICKETS).toBeDefined();
      expect(labels.NAV_USERS).toBeDefined();
      expect(labels.NAV_DEPARTMENTS).toBeDefined();
      expect(labels.NAV_FAQ).toBeDefined();
      expect(labels.NAV_MESSAGES).toBeDefined();
    });

    it("should have all ticket labels", () => {
      expect(labels.TICKET_ID).toBeDefined();
      expect(labels.TICKET_SUBJECT).toBeDefined();
      expect(labels.TICKET_USER).toBeDefined();
      expect(labels.TICKET_DEPARTMENT).toBeDefined();
      expect(labels.TICKET_STATUS).toBeDefined();
    });
  });

  describe("titles", () => {
    it("should have page titles", () => {
      expect(titles.ADMIN_DASHBOARD).toBeDefined();
      expect(titles.USER_DASHBOARD).toBeDefined();
      expect(titles.LOGIN).toBeDefined();
      expect(titles.MY_TICKETS).toBeDefined();
      expect(titles.CREATE_TICKET).toBeDefined();
    });
  });

  describe("descriptions", () => {
    it("should have descriptions", () => {
      expect(descriptions.LOGIN_DESCRIPTION).toBeDefined();
      expect(descriptions.USER_WELCOME).toBeDefined();
      expect(descriptions.TICKET_CREATE_DESCRIPTION).toBeDefined();
    });
  });

  describe("buttons", () => {
    it("should have action buttons", () => {
      expect(buttons.SUBMIT).toBeDefined();
      expect(buttons.SAVE).toBeDefined();
      expect(buttons.CANCEL).toBeDefined();
      expect(buttons.DELETE).toBeDefined();
      expect(buttons.EDIT).toBeDefined();
    });

    it("should have ticket action buttons", () => {
      expect(buttons.CREATE_TICKET).toBeDefined();
      expect(buttons.REPLY).toBeDefined();
      expect(buttons.CLOSE_TICKET).toBeDefined();
      expect(buttons.TRANSFER_TICKET).toBeDefined();
    });
  });

  describe("placeholders", () => {
    it("should have input placeholders", () => {
      expect(placeholders.SEARCH_INPUT).toBeDefined();
      expect(placeholders.TICKET_SUBJECT).toBeDefined();
      expect(placeholders.TICKET_MESSAGE).toBeDefined();
      expect(placeholders.TICKET_REPLY).toBeDefined();
      expect(placeholders.USER_MOBILE).toBeDefined();
    });
  });
});
