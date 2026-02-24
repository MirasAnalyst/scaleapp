import Anthropic from '@anthropic-ai/sdk';

let cachedClient: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Supply a valid key in your environment.'
    );
  }

  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

/** Default model for generation tasks (good balance of capability and cost) */
export const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

/** Cheaper model for simpler tasks */
export const FAST_MODEL = 'claude-haiku-4-5-20251001';
