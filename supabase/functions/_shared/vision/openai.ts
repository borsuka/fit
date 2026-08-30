import {
  fetchWithTimeout,
  isRetryableStatus,
  VisionError,
  type VisionProvider,
  type VisionRequest,
  type VisionResponse,
} from './provider.ts';

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const TIMEOUT_MS = 45_000;

export const createOpenAiProvider = (apiKey: string, model: string): VisionProvider => ({
  id: 'openai',

  async analyze(request: VisionRequest): Promise<VisionResponse> {
    const response = await fetchWithTimeout(
      ENDPOINT,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: request.maxTokens,
          messages: [
            { role: 'system', content: request.system },
            {
              role: 'user',
              content: [
                { type: 'text', text: request.user },
                { type: 'image_url', image_url: { url: request.imageUrl } },
              ],
            },
          ],
        }),
      },
      TIMEOUT_MS,
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new VisionError(
        `openai ${response.status}: ${detail.slice(0, 300)}`,
        isRetryableStatus(response.status),
        response.status,
      );
    }

    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    return {
      text: body.choices?.[0]?.message?.content ?? '',
      model: body.model ?? model,
      inputTokens: body.usage?.prompt_tokens ?? 0,
      outputTokens: body.usage?.completion_tokens ?? 0,
    };
  },
});
