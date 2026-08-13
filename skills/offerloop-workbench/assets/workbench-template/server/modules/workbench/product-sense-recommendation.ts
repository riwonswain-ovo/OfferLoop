import type {
  ProductSenseDislikeReason,
  ProductSenseFollowup,
  ProductSensePreferenceSummary,
  ProductSenseQuestion,
} from '@shared/api.interface';

const createPyramidFollowups = (
  groupingPrompt: string,
  mecePrompt: string,
): ProductSenseFollowup[] => [
  {
    id: 'atomize',
    stage: 'atomize',
    title: '拆成原子判断',
    prompt:
      '回看你的初答，拆成 3–6 条一次只表达一件事的判断。'
      + '请给每条标注“事实 / 假设 / 因果 / 价值判断 / 未知项”之一。',
    helper:
      '先照亮你已经说出的内容，不补新框架，也不急着写漂亮结论。',
    minLength: 80,
  },
  {
    id: 'group',
    stage: 'group',
    title: '自下而上归组',
    prompt: groupingPrompt,
    helper:
      '选择一个主要分组标准；每组先写一句组结论，再放入支撑它的原子判断。',
    minLength: 100,
  },
  {
    id: 'mece',
    stage: 'mece',
    title: 'MECE 与证伪检查',
    prompt: mecePrompt,
    helper:
      'MECE 只要求足够回答当前问题。重点检查重复、混层、断链和决定性缺口。',
    minLength: 80,
  },
];

const PRODUCT_SENSE_QUESTIONS: ProductSenseQuestion[] = [
  {
    id: 'taobao-wechat-pay',
    company: '淘宝',
    prompt:
      '淘宝为什么在支付宝仍是阿里生态核心基础设施的情况下，'
      + '选择全面接入微信支付？',
    logicType: '商业逻辑',
    sector: '综合电商',
    scopeType: '具体功能',
    knowledgeLevel: '大众认知',
    factAnchor: '2024 年 9 月，淘宝向消费者开放微信支付。',
    sourceLabel: '新华社',
    sourceUrl:
      'https://www.xinhuanet.com/20240927/'
      + '50ba9313a0b6458c9648880644be8880/c.html',
    followups: createPyramidFollowups(
      '把原子判断归成 2–4 组，并为每组写一句结论。'
      + '特别检查“用户流失、成交增量、支付生态损失、潜在收入”'
      + '究竟是并列原因，还是原因、结果与假设的不同层级。',
      '检查各组是否使用同一划分标准、是否换词重复或因果跳跃。'
      + '再写出一个最可能推翻你结论的条件：出现什么情况时，'
      + '淘宝接入微信支付会变成不值得？',
    ),
  },
  {
    id: 'douyin-local-life',
    company: '抖音',
    prompt:
      '抖音做本地生活，为什么选择从短视频、直播和 POI 切入，'
      + '而不是先复制美团的搜索、榜单和评价体系？',
    logicType: '产品逻辑',
    sector: '内容与本地生活',
    scopeType: '具体业务',
    knowledgeLevel: '大众认知',
    factAnchor:
      '抖音生活服务通过短视频、直播和 POI 展示商品并引导到店核销。',
    sourceLabel: '抖音开放平台',
    sourceUrl:
      'https://developer.open-douyin.com/docs/resource/zh-CN/'
      + 'local-life/introduction/overview',
    followups: createPyramidFollowups(
      '把原子判断归成 2–4 组，并为每组写一句结论。'
      + '检查“内容激发需求、用户决策路径、商家供给、到店履约”'
      + '是同层理由，还是前后相接的业务链条；只能选择一种主要组织方式。',
      '检查分组是否混入了结果、案例或解决方案。'
      + '再补一个关键缺口或反例：在哪类本地消费场景中，'
      + '短视频、直播和 POI 无法替代搜索、榜单或评价？',
    ),
  },
  {
    id: 'meituan-instant-retail',
    company: '美团',
    prompt:
      '美团为什么要把原本偏应急的即时零售，升级成'
      + '“30 分钟万物到家”的日常购物平台？',
    logicType: '业务逻辑',
    sector: '本地零售',
    scopeType: '具体业务',
    knowledgeLevel: '大众认知',
    factAnchor:
      '2025 年，美团正式发布“美团闪购”，定位为新一代即时购物平台。',
    sourceLabel: '美团官方',
    sourceUrl: 'https://www.meituan.com/news/NN25041508500227X',
    followups: createPyramidFollowups(
      '把原子判断归成 2–4 组，并为每组写一句结论。'
      + '检查“用户需求变化、供给密度、履约能力、平台经济性”'
      + '是四个并列理由，还是机会出现到业务成立的因果链。',
      '检查各组能否共同推出“从应急走向日常”这一结论。'
      + '再写出最关键的失败条件：即使订单增长，'
      + '哪些成本、频次或供给信号仍会证明这项升级不成立？',
    ),
  },
];

const PRODUCT_SENSE_DISLIKE_REASONS: ProductSenseDislikeReason[] = [
  '范围太大',
  '前提模糊',
  '不感兴趣',
  '过于熟悉',
  '依赖行业知识',
  '其他原因',
];

interface ProductSenseFeedbackSnapshot {
  questionId: string;
  company: string;
  sector: string;
  logicType: string;
  scopeType: string;
  knowledgeLevel: string;
  reason: string;
  reasonDetail?: string | null;
  inferredReason?: string | null;
}

interface ScoredQuestion {
  question: ProductSenseQuestion;
  score: number;
  order: number;
}

interface CustomReasonRule {
  reason: ProductSenseDislikeReason;
  keywords: string[];
}

const CUSTOM_REASON_RULES: CustomReasonRule[] = [
  {
    reason: '范围太大',
    keywords: ['范围', '太大', '宏观', '宽泛', '泛泛', '笼统'],
  },
  {
    reason: '前提模糊',
    keywords: ['前提', '模糊', '不清楚', '信息不足', '背景不足', '事实不明'],
  },
  {
    reason: '不感兴趣',
    keywords: ['不感兴趣', '没兴趣', '无聊', '不想答', '不喜欢这个'],
  },
  {
    reason: '过于熟悉',
    keywords: ['太熟', '熟悉', '做过', '答过', '练过', '重复'],
  },
  {
    reason: '依赖行业知识',
    keywords: [
      '不懂',
      '不了解',
      '行业知识',
      '专业知识',
      '背景知识',
      '缺少背景',
      '看不懂',
      '太偏',
      '门槛',
    ],
  },
];

const getQuestion = (questionId: string): ProductSenseQuestion =>
  PRODUCT_SENSE_QUESTIONS.find(
    (question: ProductSenseQuestion): boolean =>
      question.id === questionId,
  ) ?? PRODUCT_SENSE_QUESTIONS[0];

const isDislikeReason = (
  reason: string,
): reason is ProductSenseDislikeReason =>
  PRODUCT_SENSE_DISLIKE_REASONS.includes(
    reason as ProductSenseDislikeReason,
  );

const classifyCustomReason = (
  detail: string,
): ProductSenseDislikeReason | undefined => {
  const normalized: string = detail.trim().toLowerCase();
  return CUSTOM_REASON_RULES.find(
    (rule: CustomReasonRule): boolean =>
      rule.keywords.some(
        (keyword: string): boolean => normalized.includes(keyword),
      ),
  )?.reason;
};

const getEffectiveReason = (
  feedback: ProductSenseFeedbackSnapshot,
): string => {
  if (
    feedback.reason === '其他原因'
    && feedback.inferredReason
    && isDislikeReason(feedback.inferredReason)
    && feedback.inferredReason !== '其他原因'
  ) {
    return feedback.inferredReason;
  }
  return feedback.reason;
};

const buildPreferenceSummary = (
  feedback: ProductSenseFeedbackSnapshot[],
): ProductSensePreferenceSummary => {
  const reasons: Set<string> = new Set<string>(
    feedback.map(
      (item: ProductSenseFeedbackSnapshot): string =>
        getEffectiveReason(item),
    ),
  );
  const learnedSignals: string[] = [];
  if (reasons.has('范围太大')) {
    learnedSignals.push('优先聚焦具体功能点');
  }
  if (reasons.has('前提模糊')) {
    learnedSignals.push('优先选择事实前提清晰的题');
  }
  if (reasons.has('不感兴趣')) {
    learnedSignals.push('降低相似公司与赛道');
  }
  if (reasons.has('过于熟悉')) {
    learnedSignals.push('增加跨公司与跨赛道题');
  }
  if (reasons.has('依赖行业知识')) {
    learnedSignals.push('优先大众 App 与低行业门槛');
  }
  const hasUnclassifiedDetail: boolean = feedback.some(
    (item: ProductSenseFeedbackSnapshot): boolean =>
      item.reason === '其他原因' && !item.inferredReason,
  );
  if (hasUnclassifiedDetail) {
    learnedSignals.push('已记录自定义偏好，等待更多反馈');
  }
  return {
    feedbackCount: feedback.length,
    learnedSignals,
  };
};

const scoreQuestion = (
  question: ProductSenseQuestion,
  currentQuestion: ProductSenseQuestion,
  completedIds: string[],
  sessionDislikedIds: string[],
  feedback: ProductSenseFeedbackSnapshot[],
): number => {
  let score: number = 100;
  if (completedIds.includes(question.id)) {
    score -= 60;
  }
  if (sessionDislikedIds.includes(question.id)) {
    score -= 100;
  }
  if (question.company === currentQuestion.company) {
    score -= 30;
  }
  if (question.sector === currentQuestion.sector) {
    score -= 8;
  }
  if (question.logicType === currentQuestion.logicType) {
    score -= 5;
  }
  feedback.forEach((item: ProductSenseFeedbackSnapshot): void => {
    const effectiveReason: string = getEffectiveReason(item);
    if (item.questionId === question.id) {
      score -= 80;
    }
    if (effectiveReason === '范围太大') {
      score += question.scopeType === '具体功能' ? 12 : 0;
      score -= question.scopeType === '整体应用' ? 25 : 0;
    }
    if (effectiveReason === '前提模糊') {
      score += question.scopeType === '具体功能' ? 8 : 3;
    }
    if (effectiveReason === '不感兴趣') {
      score -= item.sector === question.sector ? 24 : 0;
      score -= item.company === question.company ? 30 : 0;
    }
    if (effectiveReason === '过于熟悉') {
      score -= item.company === question.company ? 35 : 0;
      score -= item.sector === question.sector ? 10 : 0;
    }
    if (
      effectiveReason === '依赖行业知识'
      && question.knowledgeLevel === '行业认知'
    ) {
      score -= 30;
    }
  });
  return score;
};

const selectNextQuestion = (
  currentQuestionId: string,
  completedIds: string[],
  sessionDislikedValues: string[],
  feedback: ProductSenseFeedbackSnapshot[],
): ProductSenseQuestion => {
  const currentQuestion: ProductSenseQuestion =
    getQuestion(currentQuestionId);
  const sessionDislikedIds: string[] = sessionDislikedValues.map(
    (value: string): string => value.split(':')[0],
  );
  const candidates: ScoredQuestion[] = PRODUCT_SENSE_QUESTIONS
    .filter(
      (question: ProductSenseQuestion): boolean =>
        question.id !== currentQuestionId,
    )
    .map(
      (
        question: ProductSenseQuestion,
        order: number,
      ): ScoredQuestion => ({
        question,
        score: scoreQuestion(
          question,
          currentQuestion,
          completedIds,
          sessionDislikedIds,
          feedback,
        ),
        order,
      }),
    )
    .sort(
      (left: ScoredQuestion, right: ScoredQuestion): number =>
        right.score - left.score || left.order - right.order,
    );
  return candidates[0]?.question ?? currentQuestion;
};

export {
  buildPreferenceSummary,
  classifyCustomReason,
  createPyramidFollowups,
  getQuestion,
  isDislikeReason,
  PRODUCT_SENSE_QUESTIONS,
  selectNextQuestion,
};
export type { ProductSenseFeedbackSnapshot };
