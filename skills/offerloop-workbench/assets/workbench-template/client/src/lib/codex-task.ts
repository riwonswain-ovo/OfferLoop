const OFFERLOOP_ORIGIN_URL =
  'https://github.com/riwonswain-ovo/OfferLoop-development.git';

const buildOfferLoopPrompt = (
  skillName: string,
  instruction: string,
): string =>
  `请使用 ${skillName} Skill 完成下面的 OfferLoop 任务：\n\n${instruction}`;

const buildCodexTaskUrl = (
  prompt: string,
  originUrl: string = OFFERLOOP_ORIGIN_URL,
): string =>
  'codex://threads/new'
  + `?prompt=${encodeURIComponent(prompt)}`
  + `&originUrl=${encodeURIComponent(originUrl)}`;

export {
  OFFERLOOP_ORIGIN_URL,
  buildCodexTaskUrl,
  buildOfferLoopPrompt,
};
