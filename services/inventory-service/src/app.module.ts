import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CoreModule } from '@foodgrid/utils/server';
import { CostingController } from './costing/costing.controller';
import { CostingService } from './costing/costing.service';
import { InventoryEventHandlers } from './events/inventory-event.handlers';
import { InventoryController } from './ingredients/ingredients.controller';
import { IngredientsService } from './ingredients/ingredients.service';
import { InternalController } from './internal/internal.controller';
import { InventoryJobsService } from './jobs/inventory-jobs.service';
import { ProductionController } from './production/production.controller';
import { ProductionService } from './production/production.service';
import { RecipesController } from './recipes/recipes.controller';
import { RecipesService } from './recipes/recipes.service';
import { SERVICE_NAME, SUBSCRIBED_STREAMS } from './service.config';
import { StockService } from './stock/stock.service';

@Module({
  imports: [
    CoreModule.forRoot({ serviceName: SERVICE_NAME, subscribe: SUBSCRIBED_STREAMS }),
    ScheduleModule.forRoot(),
  ],
  controllers: [
    InventoryController,
    RecipesController,
    CostingController,
    ProductionController,
    InternalController,
  ],
  providers: [
    StockService,
    IngredientsService,
    RecipesService,
    CostingService,
    ProductionService,
    InventoryEventHandlers,
    InventoryJobsService,
  ],
})
export class AppModule {}
