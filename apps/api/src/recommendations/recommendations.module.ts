import { Module } from '@nestjs/common';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [RecommendationsController],
  providers: [RecommendationsService, PrismaService],
})
export class RecommendationsModule {}
