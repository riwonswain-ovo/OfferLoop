import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { WorkbenchController } from './workbench.controller';
import { WorkbenchService } from './workbench.service';

@Module({
  imports: [HttpModule],
  controllers: [WorkbenchController],
  providers: [WorkbenchService],
})
export class WorkbenchModule {}
