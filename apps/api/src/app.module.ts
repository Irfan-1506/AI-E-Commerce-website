import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { loggerConfig } from './common/logger/logger.config';
import { SentryExceptionFilter } from './common/sentry-exception.filter';
import { RedisModule } from './redis/redis.module';
import { StorageModule } from './storage/storage.module';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { CartModule } from './cart/cart.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { InventoryModule } from './inventory/inventory.module';
import { CouponsModule } from './coupons/coupons.module';
import { OrdersModule } from './orders/orders.module';
import { ReviewsModule } from './reviews/reviews.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PaymentsModule } from './payments/payments.module';
import { SearchModule } from './search/search.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { SemanticSearchModule } from './semantic-search/semantic-search.module';
import { AssistantModule } from './assistant/assistant.module';
import { FraudModule } from './fraud/fraud.module';
import { PricingModule } from './pricing/pricing.module';
import { ForecastingModule } from './forecasting/forecasting.module';
import { EventsModule } from './events/events.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    LoggerModule.forRoot(loggerConfig),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]), // global default: 100 req/min/IP
    RedisModule,
    StorageModule,
    AiModule,
    AuthModule,
    ProductsModule,
    CategoriesModule,
    CartModule,
    WishlistModule,
    InventoryModule,
    CouponsModule,
    OrdersModule,
    ReviewsModule,
    DashboardModule,
    PaymentsModule,
    SearchModule,
    RecommendationsModule,
    SemanticSearchModule,
    AssistantModule,
    FraudModule,
    PricingModule,
    ForecastingModule,
    EventsModule,
    FeatureFlagsModule,
    AnalyticsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: SentryExceptionFilter },
  ],
})
export class AppModule {}
