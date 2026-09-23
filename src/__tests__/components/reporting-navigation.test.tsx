import React from "react";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "@/components/shared/sidebar";

jest.mock("next/navigation", () => ({ usePathname: () => "/admin" }));
jest.mock("@/contexts/user-context", () => ({ useUser: () => ({ user: null }) }));

describe("reporting navigation", () => {
  it("shows the management dashboard only after server-authorized visibility", () => {
    const { rerender } = render(<Sidebar type="admin" reportingEnabled={false} />);
    expect(screen.queryByRole("link", { name: /داشبورد مدیریتی/ })).not.toBeInTheDocument();

    rerender(<Sidebar type="admin" reportingEnabled />);
    expect(screen.getByRole("link", { name: /داشبورد مدیریتی/ })).toHaveAttribute(
      "href",
      "/admin/reporting"
    );
  });
});
