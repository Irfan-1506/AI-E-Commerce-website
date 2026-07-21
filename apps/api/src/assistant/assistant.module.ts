import { Module } from '@nestjs/common';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { PrismaService } from '../prisma.service';
import { ProductsModule } from '../products/products.module';
import { SemanticSearchModule } from '../semantic-search/semantic-search.module';

@Module({
  imports: [ProductsModule, SemanticSearchModule],
  controllers: [AssistantController],
  providers: [AssistantService, PrismaService],
})
export class AssistantModule {}
