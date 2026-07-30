import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { WorkbenchController } from './workbench.controller';
import { ProductSenseService } from './product-sense.service';
import { WorkbenchCalendarService } from './workbench-calendar.service';
import { WorkbenchService } from './workbench.service';
import { WorkbenchWikiService } from './workbench-wiki.service';

@Module({
  imports: [HttpModule],
  controllers: [WorkbenchController],
  providers: [
    WorkbenchService,
    WorkbenchCalendarService,
    WorkbenchWikiService,
    ProductSenseService,
  ],
})
export class WorkbenchModule {}
