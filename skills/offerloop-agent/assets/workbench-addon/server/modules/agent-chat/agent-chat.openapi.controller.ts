import { Body, Controller, Post } from '@nestjs/common';

import type {
  AgentWorkerPollRequest,
  AgentWorkerPollResponse,
  AgentWorkerRunUpdatePayload,
  AgentWorkerRunUpdateResponse,
} from '@shared/agent-chat.interface';

import { AgentChatService } from './agent-chat.service';

@Controller('openapi/agent-worker')
export class AgentChatOpenApiController {
  constructor(private readonly agentChatService: AgentChatService) {}

  @Post('poll')
  async poll(
    @Body() request: AgentWorkerPollRequest,
  ): Promise<AgentWorkerPollResponse> {
    return this.agentChatService.pollWorker(request);
  }

  @Post('run-update')
  async updateRun(
    @Body() payload: AgentWorkerRunUpdatePayload,
  ): Promise<AgentWorkerRunUpdateResponse> {
    const { runId, ...request } = payload;
    return this.agentChatService.updateWorkerRun(runId, request);
  }
}
