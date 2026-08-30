import {
  fetchWithTimeout,
  isRetryableStatus,
  VisionError,
  type VisionProvider,
  type VisionRequest,
  type VisionResponse,
} from './provider.ts';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const TIMEOUT_MS = 45_000;

export const createAnthropicProvider = (apiKey: string, model: string): VisionProvider => ({
  id: 'anthropic',

  async analyze(request: VisionRequest): Promise<VisionResponse> {
    const response = await fetchWithTimeout(
      ENDPOINT,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'url', url: request.imageUrl } },
                { type: 'text', text: request.user },
              ],
            },
          ],
        }),
      },
      TIMEOUT_MS,
    );

    if (!response.ok) {
      // The body may carry a useful reason, but it is vendor text: it goes to
      // the log, never to the user.
      const detail = await response.text().catch(() => '');
      throw new VisionError(
        `anthropic ${response.status}: ${detail.slice(0, 300)}`,
        isRetryableStatus(response.status),
        response.status,
      );
    }

    const body = (await response.json()) as {
      content?: { type: string; text?: string }[];
      model?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    // Concatenates every text block rather than taking [0]. A response that
    // opens with a non-text block would otherwise look empty, and we would
    // report "no JSON" for an answer that was in fact there.
    const text = (body.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('');

    return {
      text,
      model: body.model ?? model,
      inputTokens: body.usage?.input_tokens ?? 0,
      outputTokens: body.usage?.output_tokens ?? 0,
    };
  },
});
