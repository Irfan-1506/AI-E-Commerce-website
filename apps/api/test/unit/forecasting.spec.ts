import { linearRegression, bucketByDay } from '../../src/forecasting/forecasting.service';

describe('linearRegression', () => {
  it('returns zero slope/intercept for an empty series', () => {
    expect(linearRegression([])).toEqual({ slope: 0, intercept: 0 });
  });

  it('finds a perfect upward trend exactly', () => {
    // y = 2x + 10
    const series = [{ value: 10 }, { value: 12 }, { value: 14 }, { value: 16 }];
    const { slope, intercept } = linearRegression(series);
    expect(slope).toBeCloseTo(2, 5);
    expect(intercept).toBeCloseTo(10, 5);
  });

  it('returns zero slope for a flat series', () => {
    const series = [{ value: 5 }, { value: 5 }, { value: 5 }];
    const { slope } = linearRegression(series);
    expect(slope).toBeCloseTo(0, 5);
  });

  it('finds a downward trend with a negative slope', () => {
    const series = [{ value: 100 }, { value: 80 }, { value: 60 }, { value: 40 }];
    const { slope } = linearRegression(series);
    expect(slope).toBeLessThan(0);
  });
});

describe('bucketByDay', () => {
  it('produces exactly `days` buckets even with no data points', () => {
    const buckets = bucketByDay([], 7);
    expect(buckets).toHaveLength(7);
    expect(buckets.every((b) => b.value === 0)).toBe(true);
  });

  it('sums multiple values landing on the same day', () => {
    const today = new Date();
    const points = [
      { date: today, value: 10 },
      { date: today, value: 5 },
    ];
    const buckets = bucketByDay(points, 3);
    const todayKey = today.toISOString().slice(0, 10);
    const todayBucket = buckets.find((b) => b.date === todayKey);
    expect(todayBucket?.value).toBe(15);
  });

  it('ignores points outside the requested window', () => {
    const longAgo = new Date('2000-01-01');
    const buckets = bucketByDay([{ date: longAgo, value: 999 }], 7);
    expect(buckets.reduce((sum, b) => sum + b.value, 0)).toBe(0);
  });
});
