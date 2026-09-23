export type DurationStatistics = {
  averageMilliseconds: number;
  medianMilliseconds: number;
  p90Milliseconds: number;
};

function assertNonNegativeDurations(values: readonly bigint[]): void {
  if (values.some((value) => value < BigInt(0))) {
    throw new RangeError("Reporting durations must not be negative");
  }
}

function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= BigInt(0)) {
    throw new RangeError("Reporting denominator must be positive");
  }
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return quotient + (remainder * BigInt(2) >= denominator ? BigInt(1) : BigInt(0));
}

function toSafeNumber(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw new RangeError("Reporting result exceeds the safe integer range");
  }
  return result;
}

/**
 * Uses exact integer arithmetic. P90 follows the nearest-rank definition and
 * even-sized medians are rounded to the nearest millisecond, half up.
 */
export function summarizeDurations(
  values: readonly bigint[]
): DurationStatistics | null {
  if (values.length === 0) return null;
  assertNonNegativeDurations(values);

  const sorted = [...values].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0
  );
  const count = BigInt(sorted.length);
  const total = sorted.reduce((sum, value) => sum + value, BigInt(0));
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? sorted[middle]
      : divideRoundHalfUp(sorted[middle - 1] + sorted[middle], BigInt(2));
  const p90Rank = Number(
    (BigInt(9) * count + BigInt(9)) / BigInt(10)
  );

  return {
    averageMilliseconds: toSafeNumber(divideRoundHalfUp(total, count)),
    medianMilliseconds: toSafeNumber(median),
    p90Milliseconds: toSafeNumber(sorted[p90Rank - 1]),
  };
}

export function percentageRoundHalfUp(
  numerator: number,
  denominator: number
): number | null {
  if (!Number.isSafeInteger(numerator) || numerator < 0) {
    throw new RangeError("Reporting numerator must be a non-negative integer");
  }
  if (!Number.isSafeInteger(denominator) || denominator < 0) {
    throw new RangeError("Reporting denominator must be a non-negative integer");
  }
  if (denominator === 0) return null;
  if (numerator > denominator) {
    throw new RangeError("Reporting numerator must not exceed its denominator");
  }

  const basisPoints = divideRoundHalfUp(
    BigInt(numerator) * BigInt(10_000),
    BigInt(denominator)
  );
  return Number(basisPoints) / 100;
}

export function decimalRatioRoundHalfUp(
  numerator: number,
  denominator: number,
  decimalPlaces = 2
): number | null {
  if (!Number.isSafeInteger(numerator) || numerator < 0) {
    throw new RangeError("Reporting numerator must be a non-negative integer");
  }
  if (!Number.isSafeInteger(denominator) || denominator < 0) {
    throw new RangeError("Reporting denominator must be a non-negative integer");
  }
  if (!Number.isSafeInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 6) {
    throw new RangeError("Reporting decimal places must be between zero and six");
  }
  if (denominator === 0) return null;

  const multiplier = BigInt(10) ** BigInt(decimalPlaces);
  const rounded = divideRoundHalfUp(
    BigInt(numerator) * multiplier,
    BigInt(denominator)
  );
  return Number(rounded) / Number(multiplier);
}

export function decimalRatioBigIntRoundHalfUp(
  numerator: bigint,
  denominator: bigint,
  decimalPlaces = 2
): number | null {
  if (numerator < BigInt(0) || denominator < BigInt(0)) {
    throw new RangeError("Reporting values must be non-negative integers");
  }
  if (!Number.isSafeInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 6) {
    throw new RangeError("Reporting decimal places must be between zero and six");
  }
  if (denominator === BigInt(0)) return null;
  const multiplier = BigInt(10) ** BigInt(decimalPlaces);
  const rounded = divideRoundHalfUp(numerator * multiplier, denominator);
  const value = Number(rounded);
  if (!Number.isSafeInteger(value)) {
    throw new RangeError("Reporting result exceeds the safe integer range");
  }
  return value / Number(multiplier);
}

export function signedDecimalRatioRoundHalfUp(
  numerator: number,
  denominator: number,
  decimalPlaces = 2
): number | null {
  if (!Number.isSafeInteger(numerator)) {
    throw new RangeError("Reporting numerator must be a safe integer");
  }
  if (!Number.isSafeInteger(denominator) || denominator < 0) {
    throw new RangeError("Reporting denominator must be a non-negative integer");
  }
  if (!Number.isSafeInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 6) {
    throw new RangeError("Reporting decimal places must be between zero and six");
  }
  if (denominator === 0) return null;
  const sign = numerator < 0 ? -1 : 1;
  const multiplier = BigInt(10) ** BigInt(decimalPlaces);
  const rounded = divideRoundHalfUp(
    BigInt(Math.abs(numerator)) * multiplier,
    BigInt(denominator)
  );
  return sign * Number(rounded) / Number(multiplier);
}
