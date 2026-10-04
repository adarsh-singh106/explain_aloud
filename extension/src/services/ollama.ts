export interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
}

export async function checkOllamaServer(baseUrl = 'http://127.0.0.1:11434'): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function generateWithGemma(
  prompt: string,
  model = 'gemma4:e4b',
  baseUrl = 'http://127.0.0.1:11434'
): Promise<string> {
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
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Ollama error (${res.status}): ${errText || res.statusText}`);
  }

  const data: OllamaGenerateResponse = await res.json();
  return data.response;
}
