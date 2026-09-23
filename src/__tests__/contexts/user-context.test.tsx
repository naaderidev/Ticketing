import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserProvider, useUser } from "@/contexts/user-context";

let mockPathname = "/";

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

function UserStateProbe() {
  const { user, isLoading } = useUser();

  return (
    <div>
      <span data-testid="loading">{isLoading ? "loading" : "ready"}</span>
      <span data-testid="user">{user ? `${user.firstName} ${user.lastName}` : "guest"}</span>
    </div>
  );
}

function renderUserProvider(pathname: string, strictMode = false) {
  mockPathname = pathname;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const content = (
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <UserStateProbe />
      </UserProvider>
    </QueryClientProvider>
  );

  return render(strictMode ? <StrictMode>{content}</StrictMode> : content);
}

describe("UserProvider session loading", () => {
  beforeEach(() => {
    mockPathname = "/";
  });

  it.each(["/", "/user/login", "/user/signup", "/forbidden", "/unauthorized"])(
    "does not request an authenticated session on public path %s",
    async (pathname) => {
      renderUserProvider(pathname);

      await waitFor(() => {
        expect(screen.getByTestId("loading")).toHaveTextContent("ready");
      });
      expect(global.fetch).not.toHaveBeenCalled();
      expect(screen.getByTestId("user")).toHaveTextContent("guest");
    },
  );

  it("deduplicates the current-user request under React Strict Mode", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        id: 8,
        firstName: "زهرا",
        lastName: "رضایی",
        mobile: "09120000101",
        role: "USER",
      }),
    });

    renderUserProvider("/user", true);

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("زهرا رضایی");
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith("/api/users/me", {
      cache: "no-store",
    });
  });
});
