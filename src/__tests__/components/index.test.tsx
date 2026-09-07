import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { TicketInfo } from "@/components/ticket/ticket-info";
import { StarRating } from "@/components/shared/star-rating";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { ErrorMessage } from "@/components/shared/error-boundary";

const mockTicket = {
  id: "1",
  ticketId: "TK-TEST-123",
  subject: "Test Ticket",
  message: "Test Message",
  status: "OPEN" as const,
  userName: "Ali Ahmadi",
  rating: 4,
  createdAt: "2024-01-15T10:30:00.000Z",
  department: { id: 1, name: "Department 1" },
  subDepartment: { id: 1, name: "Sub Department 1" },
  replies: [],
  attachments: [],
};

describe("Components", () => {
  describe("TicketInfo", () => {
    it("should render ticket info correctly", () => {
      render(<TicketInfo ticket={mockTicket} isAdmin={false} />);
      expect(screen.getByText("Ali Ahmadi")).toBeInTheDocument();
      expect(screen.getByText("Department 1 / Sub Department 1")).toBeInTheDocument();
    });

    it("should render rating for admin", () => {
      render(<TicketInfo ticket={mockTicket} isAdmin={true} />);
      expect(screen.getByText("Ali Ahmadi")).toBeInTheDocument();
      expect(screen.getByText(/از ۵/)).toBeInTheDocument();
    });
  });

  describe("StarRating", () => {
    it("should render 5 stars", () => {
      const { container } = render(<StarRating rating={3} />);
      const stars = container.querySelectorAll("svg");
      expect(stars.length).toBe(5);
    });

    it("should have data-testid", () => {
      render(<StarRating rating={4} />);
      expect(screen.getByTestId("star-rating")).toBeInTheDocument();
    });
  });

  describe("LoadingSpinner", () => {
    it("should render loading spinner with status role", () => {
      render(<LoadingSpinner />);
      const spinner = screen.getByRole("status");
      expect(spinner).toBeInTheDocument();
    });
  });

  describe("ErrorMessage", () => {
    it("should render error message", () => {
      render(<ErrorMessage message="Test error message" />);
      expect(screen.getByText("Test error message")).toBeInTheDocument();
    });

    it("should render retry button when onRetry is provided", () => {
      const onRetry = jest.fn();
      render(<ErrorMessage message="Test error" onRetry={onRetry} />);
      const retryButton = screen.getByText("تلاش مجدد");
      expect(retryButton).toBeInTheDocument();
      retryButton.click();
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });
});
