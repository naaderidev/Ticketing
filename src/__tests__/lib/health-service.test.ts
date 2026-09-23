import {
  createReadinessChecker,
  type ReadinessDependencies,
} from "@/lib/health-service";

function createDependencies(
  overrides: Partial<ReadinessDependencies> = {}
): ReadinessDependencies {
  return {
    validateConfiguration: jest.fn(),
    checkDatabase: jest.fn().mockResolvedValue(undefined),
    now: jest.fn().mockReturnValue(1_000),
    logFailure: jest.fn(),
    ...overrides,
  };
}

describe("readiness checker", () => {
  it("reports ready after validating configuration and database access", async () => {
    const dependencies = createDependencies();
    const checkReadiness = createReadinessChecker(dependencies);

    await expect(checkReadiness("https://tickets.example.test")).resolves.toEqual({
      ready: true,
    });
    expect(dependencies.validateConfiguration).toHaveBeenCalledWith(
      "https://tickets.example.test"
    );
    expect(dependencies.checkDatabase).toHaveBeenCalledTimes(1);
  });

  it("caches a completed probe to avoid excessive database traffic", async () => {
    const dependencies = createDependencies();
    const checkReadiness = createReadinessChecker(dependencies, 5_000);

    await checkReadiness("https://tickets.example.test");
    await checkReadiness("https://tickets.example.test");

    expect(dependencies.checkDatabase).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent database probes", async () => {
    let finishDatabaseCheck: (() => void) | undefined;
    const checkDatabase = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishDatabaseCheck = resolve;
        })
    );
    const dependencies = createDependencies({ checkDatabase });
    const checkReadiness = createReadinessChecker(dependencies);

    const firstCheck = checkReadiness("https://tickets.example.test");
    const secondCheck = checkReadiness("https://tickets.example.test");
    finishDatabaseCheck?.();

    await expect(Promise.all([firstCheck, secondCheck])).resolves.toEqual([
      { ready: true },
      { ready: true },
    ]);
    expect(checkDatabase).toHaveBeenCalledTimes(1);
  });

  it("fails closed when runtime configuration is invalid", async () => {
    const failure = new Error("invalid configuration");
    const dependencies = createDependencies({
      validateConfiguration: jest.fn(() => {
        throw failure;
      }),
    });
    const checkReadiness = createReadinessChecker(dependencies);

    await expect(checkReadiness("https://tickets.example.test")).resolves.toEqual({
      ready: false,
    });
    expect(dependencies.checkDatabase).not.toHaveBeenCalled();
    expect(dependencies.logFailure).toHaveBeenCalledWith(failure);
  });

  it("recovers after the cached failure expires", async () => {
    let currentTime = 1_000;
    const checkDatabase = jest
      .fn()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValue(undefined);
    const dependencies = createDependencies({
      checkDatabase,
      now: jest.fn(() => currentTime),
    });
    const checkReadiness = createReadinessChecker(dependencies, 5_000);

    await expect(checkReadiness("https://tickets.example.test")).resolves.toEqual({
      ready: false,
    });
    currentTime = 6_001;
    await expect(checkReadiness("https://tickets.example.test")).resolves.toEqual({
      ready: true,
    });
    expect(checkDatabase).toHaveBeenCalledTimes(2);
  });
});
