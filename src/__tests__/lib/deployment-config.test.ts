import { resolveDeploymentVersion } from "@/lib/deployment-config";

describe("deployment configuration", () => {
  it("uses a development identifier outside production", () => {
    expect(resolveDeploymentVersion(undefined, "test")).toBe("development");
  });

  it("requires an immutable identifier in production", () => {
    expect(() => resolveDeploymentVersion(undefined, "production")).toThrow(
      "DEPLOYMENT_VERSION must be configured in production"
    );
  });

  it("accepts a URL-safe release identifier", () => {
    expect(resolveDeploymentVersion("commit-abc123", "production")).toBe(
      "commit-abc123"
    );
  });

  it("rejects an unsafe release identifier", () => {
    expect(() =>
      resolveDeploymentVersion("release with spaces", "production")
    ).toThrow(
      "DEPLOYMENT_VERSION must be 1-64 URL-safe alphanumeric characters"
    );
  });
});
