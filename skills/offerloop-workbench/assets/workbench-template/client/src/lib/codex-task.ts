const buildOfferLoopPrompt = (
  skillName: string,
  instruction: string,
): string =>
  `请使用 ${skillName} Skill 完成下面的 OfferLoop 任务：\n\n${instruction}`;

const buildCodexTaskUrl = (
  prompt: string,
  originUrl?: string,
): string => {
  const taskUrl = 'codex://threads/new'
    + `?prompt=${encodeURIComponent(prompt)}`;
  return originUrl
    ? taskUrl + `&originUrl=${encodeURIComponent(originUrl)}`
    : taskUrl;
};

export {
  buildCodexTaskUrl,
  buildOfferLoopPrompt,
};
