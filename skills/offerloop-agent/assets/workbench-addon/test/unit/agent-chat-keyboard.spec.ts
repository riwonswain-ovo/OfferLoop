import { shouldSubmitAgentMessage } from '../../client/src/pages/agent-chat/agent-chat-keyboard';

const keyboardEvent = (
  overrides: Partial<{
    isComposing: boolean;
    key: string;
    keyCode: number;
    shiftKey: boolean;
  }> = {},
) => ({
  key: overrides.key ?? 'Enter',
  shiftKey: overrides.shiftKey ?? false,
  nativeEvent: {
    isComposing: overrides.isComposing ?? false,
    keyCode: overrides.keyCode ?? 13,
  },
});

describe('Agent composer keyboard handling', () => {
  it('submits on an ordinary Enter key press', () => {
    expect(shouldSubmitAgentMessage(keyboardEvent())).toBe(true);
  });

  it('does not submit while an IME composition is active', () => {
    expect(
      shouldSubmitAgentMessage(keyboardEvent({ isComposing: true })),
    ).toBe(false);
  });

  it('does not submit legacy IME Enter events with keyCode 229', () => {
    expect(shouldSubmitAgentMessage(keyboardEvent({ keyCode: 229 }))).toBe(
      false,
    );
  });

  it('keeps Shift + Enter available for line breaks', () => {
    expect(shouldSubmitAgentMessage(keyboardEvent({ shiftKey: true }))).toBe(
      false,
    );
  });
});
