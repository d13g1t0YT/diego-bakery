const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

export function hasOpenAIKey(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY2?.trim()
  );
}

function configuredKeys(): string[] {
  const candidates = [
    process.env.OPENAI_API_KEY?.trim(),
    process.env.OPENAI_API_KEY2?.trim()
  ].filter((value): value is string => Boolean(value));
  return [...new Set(candidates)];
}

function isCreditExhausted(status: number, payload: any): boolean {
  if (status !== 429) return false;
  const code = String(payload?.error?.code || '').toLowerCase();
  const message = String(payload?.error?.message || '').toLowerCase();
  return (
    code === 'credit_balance_exhausted' ||
    code === 'insufficient_quota' ||
    code === 'billing_hard_limit_reached' ||
    /credit balance.*(exhausted|low)|insufficient quota|billing hard limit/.test(message)
  );
}

/**
 * Uses OPENAI_API_KEY first, then OPENAI_API_KEY2 only when OpenAI explicitly
 * reports that the primary key's account has exhausted its credit/quota.
 * Never logs or returns secret key values.
 */
export async function requestOpenAI(
  payload: unknown,
  options: { signal?: AbortSignal } = {}
): Promise<Response> {
  const keys = configuredKeys();
  if (!keys.length) {
    throw new Error('OPENAI_NOT_CONFIGURED');
  }

  let lastResponse: Response | undefined;
  for (let index = 0; index < keys.length; index += 1) {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + keys[index],
        'Content-Type': 'application/json'
      },
      signal: options.signal,
      body: JSON.stringify(payload)
    });
    lastResponse = response;

    if (response.ok) {
      if (index > 0) {
        console.warn('✓ OpenAI IA: clave alternativa aceptada tras agotar la cuota principal');
      }
      return response;
    }

    const errorPayload = await response.clone().json().catch(() => ({})) as any;
    if (index < keys.length - 1 && isCreditExhausted(response.status, errorPayload)) {
      console.warn('⚠ OpenAI IA: cuota de la clave principal agotada; intentando alternativa');
      continue;
    }

    return response;
  }

  if (!lastResponse) throw new Error('OPENAI_NOT_CONFIGURED');
  return lastResponse;
}
