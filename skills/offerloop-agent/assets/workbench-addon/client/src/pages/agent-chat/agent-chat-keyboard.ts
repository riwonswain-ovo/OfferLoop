interface AgentComposerKeyboardEvent {
  key: string;
  shiftKey: boolean;
  nativeEvent: {
    isComposing?: boolean;
    keyCode?: number;
  };
}

const shouldSubmitAgentMessage = (
  event: AgentComposerKeyboardEvent,
): boolean =>
  event.key === 'Enter' &&
  !event.shiftKey &&
  event.nativeEvent.isComposing !== true &&
  event.nativeEvent.keyCode !== 229;

export { shouldSubmitAgentMessage };
export type { AgentComposerKeyboardEvent };
