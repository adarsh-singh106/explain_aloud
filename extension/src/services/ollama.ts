export interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
}

export interface OllamaOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  baseUrl?: string;
  fallbackModel?: string;
}

/**
 * Checks if the local Ollama server is reachable on loopback.
 */
export async function checkOllamaServer(baseUrl = 'http://127.0.0.1:11434'): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Lists the models currently installed on the local Ollama server.
 */
export async function listOllamaModels(baseUrl = 'http://127.0.0.1:11434'): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { method: 'GET' });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data || !Array.isArray(data.models)) return [];
    return data.models.map((m: any) => m.name || m.model).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Checks whether a specific model name is available locally in Ollama.
 */
export async function isModelAvailable(
  modelName: string,
  baseUrl = 'http://127.0.0.1:11434'
): Promise<boolean> {
  const models = await listOllamaModels(baseUrl);
  const target = modelName.toLowerCase();
  return models.some((m) => m.toLowerCase() === target || m.toLowerCase().startsWith(`${target}:`));
}

/**
 * Sends a generation request to local Ollama with bounded timeout and abort support.
 * Falls back to E2B if E4B fails or is unavailable within the budget.
 */
export async function generateWithGemma(
  prompt: string,
  model = 'gemma4:e4b',
  options: OllamaOptions = {}
): Promise<string> {
  const baseUrl = options.baseUrl || 'http://127.0.0.1:11434';
  const timeoutMs = options.timeoutMs ?? 8000; // 8s bounded deadline per generation

  const controller = new AbortController();
  let timer: any = null;

  if (timeoutMs > 0) {
    timer = setTimeout(() => {
      controller.abort(new Error(`Ollama generation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  }

  // Link external signal if provided
  if (options.signal) {
    options.signal.addEventListener('abort', () => {
      controller.abort(options.signal?.reason);
    });
  }

  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // If 404 model not found and model is e4b, try fallback model e2b
      if (res.status === 404 && model === 'gemma4:e4b' && options.fallbackModel !== null) {
        const fallback = options.fallbackModel || 'gemma4:e2b';
        return generateWithGemma(prompt, fallback, {
          ...options,
          fallbackModel: undefined,
        });
      }
      const errText = await res.text().catch(() => '');
      throw new Error(`Ollama error (${res.status}): ${errText || res.statusText}`);
    }

    const data: OllamaGenerateResponse = await res.json();
    return data.response;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
