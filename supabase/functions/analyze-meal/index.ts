import { parseFoodAnalysis } from '../../../shared/ai-contracts/foodAnalysis.ts';
import { buildContext, errorResponse, HttpError, jsonResponse } from '../_shared/context.ts';
import { FOOD_ANALYSIS_V1 } from '../_shared/prompts/foodAnalysisV1.ts';
import { createAnthropicProvider } from '../_shared/vision/anthropic.ts';
import { createGoogleProvider } from '../_shared/vision/google.ts';
import { createOpenAiProvider } from '../_shared/vision/openai.ts';
import { VisionError, type ProviderId, type VisionProvider } from '../_shared/vision/provider.ts';

/**
 * POST /functions/v1/analyze-meal   { scan_id: string, locale?: 'en' | 'bg' }
 *
 *   auth -> quota -> signed URL -> vision -> parse -> validate -> persist
 *
 * The order matters. The quota is reserved BEFORE the vendor call, so a user
 * at their limit costs us nothing, and a burst of concurrent requests cannot
 * each see the last free slot.
 */

const SCAN_QUOTA_FREE = 3;
const SCAN_QUOTA_PREMIUM = 100; // a ceiling against runaway automation, not a product limit
const SIGNED_URL_TTL_SECONDS = 120;

const buildProvider = (): VisionProvider => {
  const id = (Deno.env.get('AI_VISION_PROVIDER') ?? 'anthropic') as ProviderId;

  switch (id) {
    case 'anthropic': {
      const key = Deno.env.get('ANTHROPIC_API_KEY');
      if (!key) throw new HttpError(500, 'ai_unavailable', 'ANTHROPIC_API_KEY is not set');
      return createAnthropicProvider(key, Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-5');
    }
    case 'openai': {
      const key = Deno.env.get('OPENAI_API_KEY');
      if (!key) throw new HttpError(500, 'ai_unavailable', 'OPENAI_API_KEY is not set');
      return createOpenAiProvider(key, Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o');
    }
    case 'google': {
      const key = Deno.env.get('GOOGLE_AI_API_KEY');
      if (!key) throw new HttpError(500, 'ai_unavailable', 'GOOGLE_AI_API_KEY is not set');
      return createGoogleProvider(key, Deno.env.get('GOOGLE_MODEL') ?? 'gemini-2.0-flash');
    }
    default:
      throw new HttpError(500, 'ai_unavailable', `unknown AI_VISION_PROVIDER: ${id}`);
  }
};

Deno.serve(async (request: Request): Promise<Response> => {
  const startedAt = Date.now();

  try {
    if (request.method !== 'POST') {
      throw new HttpError(405, 'server_error', 'method not allowed');
    }

    const ctx = await buildContext(request);
    const body = (await request.json().catch(() => ({}))) as {
      scan_id?: string;
      locale?: string;
    };

    const scanId = body.scan_id;
    if (typeof scanId !== 'string' || scanId.length === 0) {
      throw new HttpError(400, 'validation_failed', 'scan_id is required');
    }

    // Read through the USER's client, so RLS proves the scan is theirs. Reading
    // it with service_role would let any authenticated caller analyse any
    // scan id they could guess.
    const { data: scan, error: scanError } = await ctx.userClient
      .from('ai_scans')
      .select('id, image_path, status')
      .eq('id', scanId)
      .maybeSingle();

    if (scanError !== null) throw new HttpError(500, 'server_error', scanError.message);
    if (scan === null) throw new HttpError(404, 'not_found', 'scan not found');
    if (scan.status !== 'pending') {
      // Re-analysing a confirmed scan would bill us twice for a result the
      // user already acted on.
      throw new HttpError(409, 'conflict', `scan is ${scan.status}, not pending`);
    }

    // --- quota, before spending anything -----------------------------------
    const limit = ctx.isPremium ? SCAN_QUOTA_PREMIUM : SCAN_QUOTA_FREE;
    const { data: allowed, error: quotaError } = await ctx.serviceClient.rpc('consume_ai_quota', {
      p_user_id: ctx.userId,
      p_feature: 'scan',
      p_limit: limit,
    });

    if (quotaError !== null) throw new HttpError(500, 'server_error', quotaError.message);
    if (allowed !== true) {
      throw new HttpError(
        402,
        ctx.isPremium ? 'quota_exceeded' : 'premium_required',
        'daily scan quota reached',
      );
    }

    // --- short-lived signed URL --------------------------------------------
    const { data: signed, error: signError } = await ctx.serviceClient.storage
      .from('food-photos')
      .createSignedUrl(scan.image_path, SIGNED_URL_TTL_SECONDS);

    if (signError !== null || signed === null) {
      throw new HttpError(500, 'storage_failed', signError?.message ?? 'could not sign the image');
    }

    await ctx.serviceClient.from('ai_scans').update({ status: 'analyzing' }).eq('id', scanId);

    // --- vision --------------------------------------------------------------
    const provider = buildProvider();
    const visionRequest = {
      imageUrl: signed.signedUrl,
      system: FOOD_ANALYSIS_V1.system,
      user: FOOD_ANALYSIS_V1.buildUser(body.locale === 'bg' ? 'bg' : 'en'),
      maxTokens: FOOD_ANALYSIS_V1.maxTokens,
    };

    let vision;
    try {
      vision = await provider.analyze(visionRequest);
    } catch (e) {
      if (e instanceof VisionError && e.retryable) {
        // Exactly one retry. A second failure is a vendor problem, and looping
        // on it holds the user on a spinner while the bill grows.
        await new Promise((resolve) => setTimeout(resolve, 1200));
        vision = await provider.analyze(visionRequest);
      } else {
        throw e;
      }
    }

    // --- parse, with one repair attempt --------------------------------------
    let parsed = parseFoodAnalysis(vision.text);

    if (!parsed.ok) {
      const repair = await provider.analyze({
        ...visionRequest,
        user: `${visionRequest.user}

Your previous reply could not be parsed: ${parsed.failure.detail}
Return ONLY the JSON object, with no prose and no code fence.`,
      });
      vision = {
        ...repair,
        inputTokens: vision.inputTokens + repair.inputTokens,
        outputTokens: vision.outputTokens + repair.outputTokens,
      };
      parsed = parseFoodAnalysis(repair.text);
    }

    const latencyMs = Date.now() - startedAt;

    if (!parsed.ok) {
      await ctx.serviceClient
        .from('ai_scans')
        .update({
          status: 'failed',
          error_code: parsed.failure.kind,
          provider: provider.id,
          model: vision.model,
          latency_ms: latencyMs,
          input_tokens: vision.inputTokens,
          output_tokens: vision.outputTokens,
          prompt_version: FOOD_ANALYSIS_V1.version,
        })
        .eq('id', scanId);

      throw new HttpError(422, 'ai_invalid_response', `unparseable: ${parsed.failure.detail}`);
    }

    const analysis = parsed.value;

    await ctx.serviceClient
      .from('ai_scans')
      .update({
        status: analysis.is_food ? 'matched' : 'failed',
        is_food: analysis.is_food,
        provider: provider.id,
        model: vision.model,
        prompt_version: FOOD_ANALYSIS_V1.version,
        latency_ms: latencyMs,
        input_tokens: vision.inputTokens,
        output_tokens: vision.outputTokens,
        ...(analysis.is_food ? {} : { error_code: 'not_food' }),
      })
      .eq('id', scanId);

    if (!analysis.is_food) {
      // A distinct path, not an error. "That doesn't look like a meal" is
      // something the user can act on; a 500 is not.
      return jsonResponse({ is_food: false, items: [] });
    }

    // Written by the pipeline, never posted by a client - ai_scan_items has no
    // client INSERT policy, because a forged item would corrupt the accuracy
    // record we intend to measure prompt versions with.
    const { error: itemsError } = await ctx.serviceClient.from('ai_scan_items').insert(
      analysis.items.map((item, index) => ({
        scan_id: scanId,
        user_id: ctx.userId,
        label: item.label,
        normalized_query: item.normalized_query,
        estimated_grams: item.estimated_grams,
        confidence: item.confidence,
        portion_basis: item.portion_basis,
        preparation: item.preparation,
        sort_order: index,
      })),
    );

    if (itemsError !== null) throw new HttpError(500, 'server_error', itemsError.message);

    console.log(
      JSON.stringify({
        level: 'info',
        event: 'meal_analyzed',
        user_id: ctx.userId,
        scan_id: scanId,
        provider: provider.id,
        model: vision.model,
        prompt_version: FOOD_ANALYSIS_V1.version,
        item_count: analysis.items.length,
        duration_ms: latencyMs,
        input_tokens: vision.inputTokens,
        output_tokens: vision.outputTokens,
      }),
    );

    return jsonResponse({
      is_food: true,
      scan_id: scanId,
      prompt_version: FOOD_ANALYSIS_V1.version,
      items: analysis.items,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
