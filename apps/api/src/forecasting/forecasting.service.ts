import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const HISTORY_DAYS = 60;
const FORECAST_DAYS = 14;

@Injectable()
export class ForecastingService {
  constructor(private prisma: PrismaService) {}

  /**
   * Sales forecast: daily revenue for the last HISTORY_DAYS, projected
   * forward FORECAST_DAYS via simple linear regression. This is genuinely
   * the right tool at this data volume — ARIMA/Prophet-style models need
   * months of stable history and seasonality data to outperform a straight
   * line, which a pre-revenue-to-early-revenue store doesn't have yet.
   * Swap in a real forecasting library once there's enough order history
   * (a year+) to fit seasonality against.
   */
  async salesForecast(sellerId?: string) {
    const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000);

    const where = sellerId
      ? { createdAt: { gte: since }, status: { in: ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'] as const }, items: { some: { variant: { product: { sellerId } } } } }
      : { createdAt: { gte: since }, status: { in: ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'] as const } };

    const orders = await this.prisma.order.findMany({ where, select: { total: true, createdAt: true } });

    const dailyRevenue = bucketByDay(orders.map((o) => ({ date: o.createdAt, value: Number(o.total) })), HISTORY_DAYS);
    const { slope, intercept } = linearRegression(dailyRevenue);

    const forecast = Array.from({ length: FORECAST_DAYS }, (_, i) => {
      const x = dailyRevenue.length + i;
      return { daysFromNow: i + 1, projectedRevenue: Math.max(0, Math.round(slope * x + intercept)) };
    });

    return {
      historyDays: HISTORY_DAYS,
      dailyRevenue,
      trend: slope > 0 ? 'growing' : slope < 0 ? 'declining' : 'flat',
      forecast,
    };
  }

  /** Same approach, per-product unit demand instead of revenue — feeds restocking decisions. */
  async demandForecast(productId: string) {
    const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000);

    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        variant: { productId },
        order: { createdAt: { gte: since }, status: { in: ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'] } },
      },
      select: { quantity: true, order: { select: { createdAt: true } } },
    });

    const dailyUnits = bucketByDay(
      orderItems.map((i) => ({ date: i.order.createdAt, value: i.quantity })),
      HISTORY_DAYS,
    );
    const { slope, intercept } = linearRegression(dailyUnits);

    const projectedNext14Days = Array.from({ length: FORECAST_DAYS }, (_, i) => {
      const x = dailyUnits.length + i;
      return Math.max(0, slope * x + intercept);
    }).reduce((sum, v) => sum + v, 0);

    return {
      historyDays: HISTORY_DAYS,
      dailyUnits,
      trend: slope > 0 ? 'growing' : slope < 0 ? 'declining' : 'flat',
      projectedUnitsNext14Days: Math.round(projectedNext14Days),
    };
  }
}

export function bucketByDay(points: { date: Date; value: number }[], days: number) {
  const buckets = new Map<string, number>();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const p of points) {
    const key = p.date.toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + p.value);
  }
  return Array.from(buckets.entries()).map(([date, value]) => ({ date, value }));
}

/** Ordinary least squares on (index, value) pairs — the simplest honest trend line. */
export function linearRegression(series: { value: number }[]) {
  const n = series.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  const xs = series.map((_, i) => i);
  const ys = series.map((s) => s.value);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  return { slope, intercept };
}
