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
      if (attempt < attempts && delayMs > 0) {
        await wait(delayMs);
      }
    }
  }
  throw lastError;
}
