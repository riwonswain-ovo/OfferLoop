import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';

import type { Request } from 'express';
import type {
  AgentChatCancelRunRequest,
  AgentChatCreateRunRequest,
  AgentChatCreateRunResponse,
  AgentChatCancelRunResponse,
  AgentChatRunResponse,
  AgentChatStatusResponse,
  AgentConversationArchiveResponse,
  AgentConversationCreateResponse,
  AgentConversationDetailResponse,
  AgentConversationListResponse,
} from '@shared/agent-chat.interface';

import { AgentChatService } from './agent-chat.service';

@Controller('api/agent-chat')
export class AgentChatController {
  constructor(private readonly agentChatService: AgentChatService) {}

  @NeedLogin()
  @Get('status')
  async getStatus(@Req() req: Request): Promise<AgentChatStatusResponse> {
    const userId: string = req.userContext.userId;
    return this.agentChatService.getStatus(userId);
  }

  @NeedLogin()
  @Post('runs')
  async createRun(
    @Req() req: Request,
    @Body() request: AgentChatCreateRunRequest,
  ): Promise<AgentChatCreateRunResponse> {
    const userId: string = req.userContext.userId;
    return this.agentChatService.createRun(userId, request);
  }

  @NeedLogin()
  @Post('run-cancel')
  async cancelRun(
    @Req() req: Request,
    @Body() request: AgentChatCancelRunRequest,
  ): Promise<AgentChatCancelRunResponse> {
    const userId: string = req.userContext.userId;
    return this.agentChatService.cancelRun(userId, request.runId);
  }

  @NeedLogin()
  @Post('conversations')
  async createConversation(
    @Req() req: Request,
  ): Promise<AgentConversationCreateResponse> {
    const userId: string = req.userContext.userId;
    return this.agentChatService.createConversation(userId);
  }

  @NeedLogin()
  @Get('conversations')
  async listConversations(
    @Req() req: Request,
  ): Promise<AgentConversationListResponse> {
    const userId: string = req.userContext.userId;
    return this.agentChatService.listConversations(userId);
  }

  @NeedLogin()
  @Get('conversations/:sessionId')
  async getConversation(
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
  ): Promise<AgentConversationDetailResponse> {
    const userId: string = req.userContext.userId;
    return this.agentChatService.getConversation(userId, sessionId);
  }

  @NeedLogin()
  @Post('conversations/:sessionId/archive')
  async archiveConversation(
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
  ): Promise<AgentConversationArchiveResponse> {
    const userId: string = req.userContext.userId;
    return this.agentChatService.archiveConversation(userId, sessionId);
  }

  @NeedLogin()
  @Get('runs/:runId')
  async getRun(
    @Req() req: Request,
    @Param('runId') runId: string,
  ): Promise<AgentChatRunResponse> {
    const userId: string = req.userContext.userId;
    return this.agentChatService.getRun(userId, runId);
  }
}
