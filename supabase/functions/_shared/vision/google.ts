import {
  fetchWithTimeout,
  isRetryableStatus,
  VisionError,
  type VisionProvider,
  type VisionRequest,
  type VisionResponse,
} from './provider.ts';

const TIMEOUT_MS = 45_000;

/**
 * Gemini does not fetch an image from a URL the way the other two do - it
 * wants the bytes inline, or a Files API handle. So this adapter downloads
 * from the signed URL itself and base64-encodes.
 *
 * That asymmetry is exactly why the interface passes a URL rather than bytes:
 * two of the three providers would otherwise pay to move an image through this
 * function for no reason.
 */
const toBase64 = (bytes: Uint8Array): string => {
  // Chunked on purpose: String.fromCharCode(...bytes) on a 300 KB image blows
  // the argument limit and throws a RangeError that reads like a vendor fault.
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
};

export const createGoogleProvider = (apiKey: string, model: string): VisionProvider => ({
  id: 'google',

  async analyze(request: VisionRequest): Promise<VisionResponse> {
    const imageResponse = await fetchWithTimeout(request.imageUrl, { method: 'GET' }, TIMEOUT_MS);
    if (!imageResponse.ok) {
      throw new VisionError(
        `google: could not read the image (${imageResponse.status})`,
        true,
        imageResponse.status,
      );
    }
    const mimeType = imageResponse.headers.get('content-type') ?? 'image/jpeg';
    const bytes = new Uint8Array(await imageResponse.arrayBuffer());

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const response = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // A header rather than a query parameter: a key in a URL ends up in
          // access logs and proxy caches.
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: [
            {
              role: 'user',
              parts: [
                { inline_data: { mime_type: mimeType, data: toBase64(bytes) } },
                { text: request.user },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: request.maxTokens },
        }),
      },
      TIMEOUT_MS,
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new VisionError(
        `google ${response.status}: ${detail.slice(0, 300)}`,
        isRetryableStatus(response.status),
        response.status,
      );
    }

    const body = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    const text = (body.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('');

    return {
      text,
      model,
      inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
    };
  },
});
