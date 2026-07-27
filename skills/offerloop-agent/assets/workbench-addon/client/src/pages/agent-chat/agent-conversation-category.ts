import type {
  AgentConversationSummary,
  AgentKnowledgeNode,
} from '@shared/agent-chat.interface';

const ROUTE_CATEGORIES: Record<string, string> = {
  'interview-prep': '面试准备',
  'job-collection': '招聘管理',
  'mock-lab': '模拟面试',
  'offerloop-agent': 'OfferLoop Agent',
  'offerloop-setup': '使用指南',
  'offerloop-workbench': '飞书工作台',
  'offerloop-workspace': '求职知识库',
  'pm-sense': '产品思维训练',
  'recruiting-reminder': '招聘日程',
  'experience-deepthink': '经历深挖',
  'talk-review': '面试复盘',
};

const ROUTE_CATEGORY_HINTS: Record<string, string[]> = {
  'interview-prep': ['面试准备', '面试'],
  'job-collection': ['招聘管理', '招聘'],
  'mock-lab': ['模拟面试'],
  'offerloop-agent': ['使用指南', '工作台'],
  'offerloop-setup': ['使用指南', '工作台'],
  'offerloop-workbench': ['使用指南', '工作台'],
  'offerloop-workspace': ['使用指南', '知识库'],
  'pm-sense': ['产品思维', '产品 sense', '产品'],
  'recruiting-reminder': ['招聘日程', '招聘管理', '日程'],
  'experience-deepthink': ['经历深挖', '实习经历', '项目经历', '科研经历', '竞赛经历', '学生工作', '财务岗', 'hr岗'],
  'talk-review': ['面试复盘', '复盘'],
};

const resolveConversationCategory = (
  conversation: AgentConversationSummary,
  knowledgeNodes: AgentKnowledgeNode[],
): string => {
  const hints: string[] = ROUTE_CATEGORY_HINTS[conversation.route] ?? [];
  for (const hint of hints) {
    const normalizedHint: string = hint.toLowerCase();
    const matched: AgentKnowledgeNode | undefined = knowledgeNodes.find(
      (node: AgentKnowledgeNode): boolean =>
        typeof node.title === 'string' &&
        node.title.toLowerCase().includes(normalizedHint),
    );
    if (matched) {
      return matched.title;
    }
  }
  return ROUTE_CATEGORIES[conversation.route] ?? '其他求职任务';
};

export { resolveConversationCategory };
