import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./env.js";
import {
  FirmaYaError,
  cancelEnvelope,
  createEnvelope,
  downloadDocument,
  getEnvelope,
  verifyWebhook,
} from "./firmaya.js";
import { samplePdf } from "./samplePdf.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const DATA = `${root}data/state.json`;
const SIGNED = `${root}firmados/`;
mkdirSync(`${root}data`, { recursive: true });
mkdirSync(SIGNED, { recursive: true });

// The demo's whole "database": envelopes it created and webhook events it got.
const state = existsSync(DATA)
  ? JSON.parse(readFileSync(DATA, "utf8"))
  : { envelopes: {}, events: [], deliveries: [] };
const save = () => writeFileSync(DATA, JSON.stringify(state, null, 2));

const send = (res, status, body, type = "application/json") => {
  res.writeHead(status, { "Content-Type": type });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });

const apiError = (res, error) =>
  error instanceof FirmaYaError
    ? send(res, error.status, { code: error.code, message: error.message, field: error.field })
    : send(res, 500, { code: "demo_error", message: error.message });

/** The webhook: verify, ignore duplicates, keep the event, save the PDFs. */
async function webhook(req, res) {
  const raw = await readBody(req);
  if (!verifyWebhook(raw, req.headers["firmaya-signature"])) {
    console.warn("✗ webhook con firma inválida — rechazado");
    return send(res, 400, { ok: false });
  }
  const deliveryId = req.headers["firmaya-delivery-id"];
  // At-least-once delivery: the same id can arrive twice.
  if (state.deliveries.includes(deliveryId)) return send(res, 200, { ok: true, duplicate: true });
  const event = JSON.parse(raw.toString("utf8"));
  state.deliveries.push(deliveryId);

  const saved = [];
  for (const doc of event.data?.documents ?? []) {
    if (!doc.content) continue;
    const name = `${event.data.id.slice(0, 8)}-${doc.filename ?? doc.id}`;
    writeFileSync(`${SIGNED}${name}`, Buffer.from(doc.content, "base64"));
    saved.push(name);
    delete doc.content; // keep state.json small
  }
  state.events.unshift({ receivedAt: new Date().toISOString(), type: event.type, envelopeId: event.data?.id, saved });
  if (state.envelopes[event.data?.id]) Object.assign(state.envelopes[event.data.id], { status: event.data.status });
  save();
  console.log(`✓ ${event.type} (${event.data?.id})${saved.length ? ` → firmados/${saved.join(", ")}` : ""}`);
  send(res, 200, { ok: true });
}

async function route(req, res) {
  const url = new URL(req.url, "http://localhost");
  const [, , , id, action, documentId] = url.pathname.split("/"); // /api/envelopes/:id/:action/:doc

  if (req.method === "GET" && url.pathname === "/") {
    return send(res, 200, readFileSync(`${root}public/index.html`), "text/html; charset=utf-8");
  }
  if (req.method === "POST" && url.pathname === "/webhook") return webhook(req, res);

  if (req.method === "GET" && url.pathname === "/api/state") {
    return send(res, 200, {
      envelopes: Object.values(state.envelopes).sort((a, b) => b.created_at.localeCompare(a.created_at)),
      events: state.events.slice(0, 30),
      environment: config.apiKey.startsWith("fy_live_") ? "production" : "staging",
      webhookUrl: config.webhookUrl,
    });
  }

  if (req.method === "POST" && url.pathname === "/api/envelopes") {
    const input = JSON.parse((await readBody(req)).toString("utf8"));
    const title = input.title || "Contrato de prueba";
    // Without any PDF, the generated sample stands in.
    const documents = input.documents?.length
      ? input.documents
      : [{ filename: "contrato.pdf", content: samplePdf(title).toString("base64") }];
    try {
      const envelope = await createEnvelope({
        title,
        externalId: `demo-${Date.now()}`,
        documents,
        signers: input.signers,
      });
      state.envelopes[envelope.id] = envelope;
      save();
      return send(res, 201, envelope);
    } catch (error) {
      return apiError(res, error);
    }
  }

  if (url.pathname.startsWith("/api/envelopes/") && id) {
    try {
      if (req.method === "POST" && action === "refresh") {
        state.envelopes[id] = await getEnvelope(id);
        save();
        return send(res, 200, state.envelopes[id]);
      }
      if (req.method === "POST" && action === "cancel") {
        state.envelopes[id] = await cancelEnvelope(id);
        save();
        return send(res, 200, state.envelopes[id]);
      }
      if (req.method === "GET" && action === "documents" && documentId) {
        const pdf = await downloadDocument(id, documentId);
        res.writeHead(200, {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${id.slice(0, 8)}.pdf"`,
        });
        return res.end(pdf);
      }
    } catch (error) {
      return apiError(res, error);
    }
  }
  send(res, 404, { code: "not_found" });
}

createServer((req, res) => route(req, res).catch((error) => apiError(res, error))).listen(config.port, () => {
  const env = config.apiKey.startsWith("fy_live_") ? "PRODUCCIÓN" : "staging";
  console.log(`FirmaYa Connect demo → http://localhost:${config.port}`);
  console.log(`  API:      ${config.apiUrl} (${env})`);
  console.log(`  Webhook:  ${config.webhookUrl || "(el del ambiente, configurado en el panel)"}`);
});
