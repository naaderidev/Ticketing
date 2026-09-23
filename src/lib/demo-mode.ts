const ENABLED_VALUES = new Set(["1", "true", "on"]);

/**
 * Demo mode is deliberately opt-in. It keeps the same product behavior in
 * development and production while allowing an HTTP-only presentation host.
 */
export function isDemoMode(
  environment: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  return ENABLED_VALUES.has(environment.DEMO_MODE?.trim().toLowerCase() ?? "");
}
