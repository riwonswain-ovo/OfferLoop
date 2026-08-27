function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}


export async function retryOperation(
  operation,
  { attempts = 3, delayMs = 250 } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const transient = error?.transient === true
        || [408, 409, 425, 429, 500, 502, 503, 504].includes(Number(error?.status))
        || /temporary|transient|network|timeout|ECONNRESET|EAI_AGAIN/i.test(String(error?.message ?? error));
      if (!transient) throw error;
      if (attempt < attempts && delayMs > 0) {
        await wait(delayMs);
      }
    }
  }
  throw lastError;
}
