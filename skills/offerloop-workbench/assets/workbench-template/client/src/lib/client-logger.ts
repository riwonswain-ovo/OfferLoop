interface ClientLogger {
  error: (message: string, error: unknown) => void;
}

const logger: ClientLogger = {
  error: (message: string, error: unknown): void => {
    const detail: { message: string; error: string } = {
      message,
      error: error instanceof Error ? error.message : String(error),
    };
    window.dispatchEvent(
      new CustomEvent('offerloop:client-error', { detail }),
    );
  },
};

export { logger };
