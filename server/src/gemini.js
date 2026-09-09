import crypto from 'node:crypto';
import { config } from './config.js';

export class GeminiEstimateError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.name = 'GeminiEstimateError';
    this.status = status;
  }
}

const estimateCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;
const RETRY_DELAYS_MS = [400];
const FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash-lite', 'gemini-3-flash'];

export async function estimateShoppingPrice({ query, quantity, unit, currency = 'VND', apiKey, model = config.geminiModel }) {
  if (!apiKey) {
    throw new GeminiEstimateError('Không gian này chưa có Gemini API key. Hãy cấu hình trong Cài đặt hoặc nhập giá thủ công.', 503);
  }

  const keyFingerprint = crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 12);
  const cacheKey = [keyFingerprint, model, String(query).trim().toLocaleLowerCase('vi'), Number(quantity), String(unit || '').trim().toLocaleLowerCase('vi'), currency].join('|');
  const cached = estimateCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return structuredClone(cached.value);
  if (cached) estimateCache.delete(cacheKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.geminiTimeoutMs);
  try {
    const request = {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: buildPrompt({ query, quantity, unit, currency }) }],
        }],
        generationConfig: {
          temperature: 0.15,
          response_mime_type: 'application/json',
        },
      }),
    };
    const models = [...new Set([model, ...FALLBACK_MODELS])];
    let response;
    let usedModel = model;
    for (const candidateModel of models) {
      usedModel = candidateModel;
      response = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidateModel)}:generateContent`,
        request,
      );
      if (response.ok || !isRetryableModelError(response.status)) break;
    }
    if (!response.ok) {
      const details = await response.text().catch(() => '');
      console.error('[MoneyMate] Gemini request failed:', usedModel, response.status, details.slice(0, 500));
      throw new GeminiEstimateError(geminiHttpErrorMessage(response.status), geminiHttpStatus(response.status));
    }
    const payload = await response.json();
    const candidate = payload?.candidates?.[0];
    const text = candidate?.content?.parts?.map((part) => part.text || '').join('') || '';
    const estimate = normalizeEstimate(parseJson(text), { query, quantity, unit, currency });
    const result = {
      ...estimate,
      sources: [],
      notes: [estimate.notes, 'Đây là ước lượng AI, chưa kiểm chứng giá trực tiếp.'].filter(Boolean).join(' '),
    };
    estimateCache.set(cacheKey, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
    if (estimateCache.size > 100) estimateCache.delete(estimateCache.keys().next().value);
    return structuredClone(result);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new GeminiEstimateError('Tra cứu giá mất quá nhiều thời gian. Bạn có thể thử lại hoặc nhập giá thủ công.', 504);
    }
    if (error instanceof GeminiEstimateError) throw error;
    console.error('[MoneyMate] Gemini response could not be parsed:', error.message);
    throw new GeminiEstimateError('Kết quả giá chưa hợp lệ. Bạn có thể nhập giá thủ công.', 422);
  } finally {
    clearTimeout(timeout);
  }
}

function isRetryableModelError(status) {
  return [400, 404, 429, 500, 502, 503].includes(status);
}

function geminiHttpStatus(status) {
  if (status === 401 || status === 403) return 403;
  if (status === 429) return 429;
  if (status === 503) return 503;
  return 502;
}

function geminiHttpErrorMessage(status) {
  if (status === 401 || status === 403) {
    return 'API key chưa có quyền dùng Gemini API. Hãy kiểm tra đúng project trong Google AI Studio.';
  }
  if (status === 429) {
    return 'API key đã hết quota hoặc bị giới hạn tốc độ. Hãy kiểm tra quota/billing rồi thử lại sau.';
  }
  if (status === 503) {
    return 'Gemini đang quá tải tạm thời. MoneyMate đã tự thử lại nhưng chưa thành công, hãy thử lại sau ít phút.';
  }
  if (status === 400) {
    return 'Gemini không chấp nhận cấu hình tra cứu này. Hãy kiểm tra model hoặc tạo API key mới.';
  }
  return 'Không thể tra cứu giá lúc này. Bạn có thể nhập giá thủ công.';
}

async function fetchWithRetry(url, options) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, options);
    if (![429, 503].includes(response.status) || attempt >= RETRY_DELAYS_MS.length) return response;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
  }
}

function buildPrompt({ query, quantity, unit, currency }) {
  return [
    'Bạn là trợ lý ước lượng giá mua sắm cho MoneyMate.',
    'Hãy ước lượng khoảng giá bán lẻ phổ biến tại Việt Nam bằng kiến thức hiện có của bạn. Đây không phải tra cứu trực tiếp và không được khẳng định là giá hiện tại.',
    'Không tạo nguồn hoặc link giả, không tính phí vận chuyển. Nếu sản phẩm mơ hồ, hãy chọn cách hiểu phổ biến nhất và ghi rõ trong notes.',
    'Chỉ trả về JSON hợp lệ, không markdown, đúng các khóa:',
    '{"normalizedName":"string","unit":"string","priceLow":number,"priceHigh":number,"recommendedPrice":number,"total":number,"categoryName":"string","confidence":"low|medium|high","notes":"string"}',
    `Món cần mua: ${query}`,
    `Số lượng: ${quantity}${unit ? ` ${unit}` : ''}`,
    `Đơn vị tiền: ${currency}`,
    'Giá phải là số nguyên theo đơn vị tiền, recommendedPrice nằm trong khoảng low-high, total = recommendedPrice * quantity.',
  ].join('\n');
}

function parseJson(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('Gemini did not return JSON');
  }
}

function normalizeEstimate(value, { query, quantity, unit }) {
  if (!value || typeof value !== 'object') throw new Error('Estimate is not an object');
  const normalizedName = textValue(value.normalizedName ?? value.name, query, 120);
  const priceLow = moneyValue(value.priceLow ?? value.aiPriceLow);
  const priceHigh = moneyValue(value.priceHigh ?? value.aiPriceHigh);
  const recommendedPrice = moneyValue(value.recommendedPrice ?? value.aiRecommendedPrice);
  const normalizedQuantity = integerValue(quantity);
  const total = moneyValue(value.total) || recommendedPrice * normalizedQuantity;
  const categoryName = textValue(value.categoryName ?? value.suggestedCategory, '', 80);
  const confidence = ['low', 'medium', 'high'].includes(String(value.confidence).toLowerCase())
    ? String(value.confidence).toLowerCase()
    : 'low';
  if (!priceLow || !priceHigh || !recommendedPrice || !normalizedQuantity
    || priceLow > priceHigh || recommendedPrice < priceLow || recommendedPrice > priceHigh
    || total !== recommendedPrice * normalizedQuantity) {
    throw new Error('Estimate failed schema validation');
  }
  return {
    normalizedName,
    quantity: normalizedQuantity,
    unit: textValue(value.unit, '', 30) || textValue(unit, '', 30) || null,
    priceLow,
    priceHigh,
    recommendedPrice,
    total,
    categoryName,
    confidence,
    notes: textValue(value.notes, '', 500),
  };
}

function moneyValue(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 && number <= 999999999999 ? number : 0;
}

function integerValue(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= 100000 ? number : 0;
}

function textValue(value, fallback, maxLength) {
  const text = String(value ?? fallback).trim();
  return text.slice(0, maxLength);
}
