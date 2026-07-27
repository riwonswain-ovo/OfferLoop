import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';

interface AgentPanelProps {
  onClose: () => void;
}

type AgentPanelComponent = React.ComponentType<AgentPanelProps>;

export interface AgentLayoutContext {
  agentOpen: boolean;
  closeAgent: () => void;
  openAgent: () => void;
}

const Layout: React.FC = () => {
  const [agentOpen, setAgentOpen] = useState<boolean>(false);
  const [agentEverOpened, setAgentEverOpened] = useState<boolean>(false);
  const [AgentPanel, setAgentPanel] = useState<AgentPanelComponent | null>(
    null,
  );
  const layoutClassName: string = agentOpen
    ? 'flex min-h-screen w-screen items-start [--offerloop-agent-panel-width:0px] xl:[--offerloop-agent-panel-width:420px]'
    : 'flex min-h-screen w-screen items-start [--offerloop-agent-panel-width:0px]';
  const context: AgentLayoutContext = {
    agentOpen,
    closeAgent: (): void => setAgentOpen(false),
    openAgent: (): void => {
      setAgentEverOpened(true);
      setAgentOpen(true);
    },
  };

  useEffect(() => {
    if (!agentEverOpened || AgentPanel) {
      return;
    }
    let cancelled = false;
    void import('@/pages/agent-chat/AgentChatPanel').then((module): void => {
      if (!cancelled) {
        setAgentPanel((): AgentPanelComponent => module.AgentChatPanel);
      }
    });
    return (): void => {
      cancelled = true;
    };
  }, [AgentPanel, agentEverOpened]);

  return (
    <div className={layoutClassName}>
      <div className="min-w-0 flex-1">
        <Outlet context={context} />
      </div>

      {agentOpen ? (
        <div className="fixed inset-0 z-[59] xl:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-foreground/20 backdrop-blur-[1px]"
            aria-label="关闭智能助手遮罩"
            onClick={(): void => setAgentOpen(false)}
          />
        </div>
      ) : null}

      {agentEverOpened ? (
        <aside
          className={
            agentOpen
              ? 'fixed inset-y-0 right-0 z-[60] h-screen w-full max-w-md border-l bg-background shadow-2xl xl:sticky xl:top-0 xl:z-auto xl:w-[420px] xl:shrink-0 xl:self-start'
              : 'hidden'
          }
        >
          {AgentPanel ? (
            <AgentPanel onClose={(): void => setAgentOpen(false)} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              正在打开智能助手…
            </div>
          )}
        </aside>
      ) : null}
    </div>
  );
};

export default Layout;
