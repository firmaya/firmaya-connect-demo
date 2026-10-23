import crypto from "node:crypto";
import { config } from "./env.js";

/** An error the API answered with: `{ error: { code, message, field } }`. */
export class FirmaYaError extends Error {
  constructor(status, body) {
    const error = body?.error ?? {};
    super(error.message ?? `HTTP ${status}`);
    this.status = status;
    this.code = error.code ?? "http_error";
    this.field = error.field;
  }
}

async function call(path, { method = "GET", body, idempotencyKey } = {}) {
  const response = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (path.includes("/documents/") && response.ok) {
    return Buffer.from(await response.arrayBuffer());
  }
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Not the API answering: a proxy page (Cloudflare 502/504), or a server
    // error page. Say what it was instead of a JSON parse error.
    const title = text.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
    const detail = text.match(/class="exception_value">([\s\S]*?)<\/pre>/)?.[1]?.split("\n")[0].trim();
    throw new FirmaYaError(response.status, {
      error: {
        code: "non_json_response",
        message: `El servidor respondió ${response.status} con una página en vez de JSON${title ? `: ${title}` : ""}${detail ? ` — ${detail}` : ""}${text.startsWith("error code:") ? `: ${text.trim()}` : ""}`,
      },
    });
  }
  if (!response.ok) throw new FirmaYaError(response.status, data);
  return data;
}

/**
 * `POST /envelopes`. `external_id` doubles as the Idempotency-Key: a retried
 * call with the same one returns the original envelope instead of a second.
 */
export function createEnvelope({ title, externalId, documents, signers }) {
  return call("/envelopes", {
    method: "POST",
    idempotencyKey: externalId,
    body: {
      title,
      external_id: externalId,
      ...(config.webhookUrl ? { webhook_url: config.webhookUrl } : {}),
      documents,
      signers,
      metadata: { origen: "firmaya-connect-demo" },
    },
  });
}

export const getEnvelope = (id) => call(`/envelopes/${id}`);
export const cancelEnvelope = (id) => call(`/envelopes/${id}/cancel`, { method: "POST" });
export const downloadDocument = (id, documentId) => call(`/envelopes/${id}/documents/${documentId}`);

/**
 * Checks `FirmaYa-Signature: t=<unix>,v1=<hex>` — HMAC-SHA256 of "<t>." + the
 * raw body with the environment's webhook secret — and refuses anything older
 * than five minutes. Must run on the raw bytes, before parsing the JSON.
 */
export function verifyWebhook(rawBody, header) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((part) => part.split("=")));
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const expected = crypto
    .createHmac("sha256", config.webhookSecret)
    .update(`${parts.t}.`)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
