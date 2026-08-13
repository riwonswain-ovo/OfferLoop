import React from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { BrowserRouter } from 'react-router-dom';

import RoutesComponent from './app';
import './index.css';

const CLIENT_BASE_PATH: string = process.env.CLIENT_BASE_PATH || '/';

const renderWorkbenchError = ({
  error,
  resetErrorBoundary,
}: FallbackProps): React.ReactNode => (
  <main className="flex min-h-screen items-center justify-center bg-background p-6">
    <section className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
      <h1 className="text-xl font-semibold">工作台暂时无法显示</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : '请稍后重试'}
      </p>
      <button
        type="button"
        onClick={resetErrorBoundary}
        className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        重新加载
      </button>
    </section>
  </main>
);

const WorkbenchApp: React.FC = () => (
  <BrowserRouter basename={CLIENT_BASE_PATH}>
    <ErrorBoundary fallbackRender={renderWorkbenchError}>
      <RoutesComponent />
    </ErrorBoundary>
  </BrowserRouter>
);

const rootElement: HTMLElement | null = document.getElementById('root');
if (!rootElement) {
  throw new Error('OfferLoop root element is missing');
}
rootElement.setAttribute('data-offerloop-react-ready', 'true');

createRoot(rootElement).render(<WorkbenchApp />);
