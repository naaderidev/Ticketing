const MINIMUM_METRICS_TOKEN_LENGTH = 32;

export function getMetricsToken(): string {
  const token = process.env.METRICS_TOKEN?.trim();
  if (
    !token ||
    token.length < MINIMUM_METRICS_TOKEN_LENGTH ||
    token.startsWith("replace_")
  ) {
    throw new Error(
      "METRICS_TOKEN must contain at least 32 non-placeholder characters"
    );
  }
  return token;
}
