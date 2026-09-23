import {
  decimalRatioRoundHalfUp,
  percentageRoundHalfUp,
  summarizeDurations,
} from "@/modules/reporting/domain/reporting-statistics";

describe("KPI-V1 reporting statistics", () => {
  it("calculates integer average, median and nearest-rank p90", () => {
    expect(
      summarizeDurations([
        BigInt(1_800_000),
        BigInt(3_600_000),
        BigInt(7_200_000),
        BigInt(10_800_000),
      ])
    ).toEqual({
      averageMilliseconds: 5_850_000,
      medianMilliseconds: 5_400_000,
      p90Milliseconds: 10_800_000,
    });
  });

  it("returns null for an empty duration cohort and rejects negative values", () => {
    expect(summarizeDurations([])).toBeNull();
    expect(() => summarizeDurations([BigInt(-1)])).toThrow(RangeError);
  });

  it("rounds percentages half up to two decimal places without floating-point drift", () => {
    expect(percentageRoundHalfUp(2, 3)).toBe(66.67);
    expect(percentageRoundHalfUp(80, 100)).toBe(80);
    expect(percentageRoundHalfUp(0, 0)).toBeNull();
  });

  it("rounds arbitrary decimal ratios half up without floating-point drift", () => {
    expect(decimalRatioRoundHalfUp(13, 3)).toBe(4.33);
    expect(decimalRatioRoundHalfUp(9, 2)).toBe(4.5);
    expect(decimalRatioRoundHalfUp(0, 0)).toBeNull();
  });
});
