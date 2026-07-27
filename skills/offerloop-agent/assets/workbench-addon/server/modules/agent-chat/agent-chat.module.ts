import { Module } from '@nestjs/common';

import { AgentChatController } from './agent-chat.controller';
import { AgentChatOpenApiController } from './agent-chat.openapi.controller';
import { AGENT_CHAT_STORE, AgentChatRepository } from './agent-chat.repository';
import { AgentChatService } from './agent-chat.service';

@Module({
  controllers: [AgentChatController, AgentChatOpenApiController],
  providers: [
    AgentChatRepository,
    {
      provide: AGENT_CHAT_STORE,
      useExisting: AgentChatRepository,
    },
    AgentChatService,
  ],
})
export class AgentChatModule {}
