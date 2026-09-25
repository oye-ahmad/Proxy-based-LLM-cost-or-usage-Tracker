// Pricing structure: USD per 1,000 tokens ($/1K tokens)
export type Rate = { prompt: number; completion: number };

export const MODEL_RATES: Record<string, Rate> = {
  // Groq Models
  "qwen/qwen3.8-27b": { prompt: 0.0002, completion: 0.0006 },
  "openai/gpt-oss-120b": { prompt: 0.0006, completion: 0.0018 },
  "allam-2-7b": { prompt: 0.0001, completion: 0.0002 },
  "llama-3.1-8b-instant": { prompt: 0.00005, completion: 0.00008 },
  "llama-3.1-70b-versatile": { prompt: 0.00059, completion: 0.00079 },
  "llama-3.3-70b-versatile": { prompt: 0.00059, completion: 0.00079 },

  // OpenAI Models
  "gpt-4o": { prompt: 0.0025, completion: 0.01 },
  "gpt-4o-mini": { prompt: 0.00015, completion: 0.0006 },
  "gpt-4-turbo": { prompt: 0.01, completion: 0.03 },
  "gpt-3.5-turbo": { prompt: 0.0005, completion: 0.0015 },

  // Anthropic Models
  "claude-3-5-sonnet-20240620": { prompt: 0.003, completion: 0.015 },
  "claude-3-5-haiku-20241022": { prompt: 0.0008, completion: 0.004 },

  // DeepSeek Models
  "deepseek/deepseek-chat": { prompt: 0.00014, completion: 0.00028 }
};

export const DEFAULT_RATE: Rate = { prompt: 0.0002, completion: 0.0006 };

/**
 * Calculates estimated USD cost for a request based on prompt and completion token counts.
 */
export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const rate = MODEL_RATES[model.toLowerCase()] ?? DEFAULT_RATE;
  const promptCost = (promptTokens / 1000) * rate.prompt;
  const completionCost = (completionTokens / 1000) * rate.completion;
  return Number((promptCost + completionCost).toFixed(6));
}
