import { Controller, Get } from '@nestjs/common';

import type { WorkbenchResponse } from '@shared/api.interface';

import { WorkbenchService } from './workbench.service';

@Controller('api/workbench')
export class WorkbenchController {
  constructor(private readonly workbenchService: WorkbenchService) {}

  @Get()
  async getWorkbench(): Promise<WorkbenchResponse> {
    return this.workbenchService.getWorkbench();
  }
}
