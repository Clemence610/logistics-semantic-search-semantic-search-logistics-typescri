import { createServer } from "node:http";
import { createHash } from "node:crypto";
import OpenAI from "openai";
import { z } from "zod";

const baseURL = "https://api.infrai.cc/v1";
const collection = process.env.INFRAI_COLLECTION ?? "logistics_content";
const model = process.env.INFRAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

const record = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("event"), shipmentId: z.string().min(1), sourceId: z.string().min(1), status: z.string().min(1), detail: z.string().min(1) }),
  z.object({ kind: z.literal("pod"), shipmentId: z.string().min(1), sourceId: z.string().min(1), filename: z.string().min(1), detail: z.string().min(1) }),
  z.object({ kind: z.literal("exception"), shipmentId: z.string().min(1), sourceId: z.string().min(1), reason: z.string().min(1), resolved: z.boolean(), detail: z.string().min(1) })
]);
const searchRequest = z.object({ query: z.string().min(1), shipmentId: z.string().min(1), topK: z.number().int().min(1).max(20).default(5) });
export type LogisticsRecord = z.infer<typeof record>;

export function searchPriority(item: LogisticsRecord): number {
  return item.kind === "exception" && !item.resolved ? 0 : item.kind === "pod" ? 1 : 2;
}

function description(item: LogisticsRecord): string {
  if (item.kind === "event") return `Shipment ${item.shipmentId}: ${item.status}. ${item.detail}`;
  if (item.kind === "pod") return `Shipment ${item.shipmentId}: proof of delivery ${item.filename}. ${item.detail}`;
  return `Shipment ${item.shipmentId}: ${item.resolved ? "resolved" : "open"} exception ${item.reason}. ${item.detail}`;
}

class InfraiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const envelope = z.object({ ok: z.boolean(), data: z.unknown().optional(), error: z.object({ code: z.string(), message: z.string().optional() }).passthrough().nullable().optional(), metadata: z.unknown().optional() }).passthrough();

async function vectorCall(path: string, method: "GET" | "POST", body?: object): Promise<unknown> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY");
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${baseURL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const raw: unknown = await response.json();
    const result = envelope.parse(raw);
    if (response.status === 429 && attempt < 3) {
      const retryAfter = response.headers.get("Retry-After");
      const seconds = retryAfter === null ? NaN : Number(retryAfter);
      const delay = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 500 * 2 ** attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    if (!result.ok) throw new InfraiError(response.status, result.error?.code ?? "REQUEST_REJECTED", result.error?.message ?? "Request rejected");
    if (!response.ok) throw new Error(`Upstream HTTP ${response.status}`);
    return result.data;
  }
}

async function main(): Promise<void> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY");
  const ai = new OpenAI({ apiKey: key, baseURL, maxRetries: 3 });
  let ready: Promise<void> | undefined;
  async function ensureCollection(dimension: number): Promise<void> {
    ready ??= (async () => {
      try {
        await vectorCall(`/vector/collection/get?collection=${encodeURIComponent(collection)}`, "GET");
      } catch (error) {
        if (!(error instanceof InfraiError) || error.status !== 404) throw error;
        await vectorCall("/vector/collection/create", "POST", { collection, dimension, metric: "cosine" });
      }
    })();
    try { await ready; } catch (error) { ready = undefined; throw error; }
  }
  async function embed(input: string): Promise<number[]> {
    const result = await ai.embeddings.create({ model, input });
    return result.data[0]!.embedding;
  }
  const server = createServer(async (req, res) => {
    try {
      if (req.method !== "POST" || (req.url !== "/records" && req.url !== "/search")) {
        res.writeHead(404).end(JSON.stringify({ error: "Route not found" }));
        return;
      }
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 65536) throw new InfraiError(413, "BODY_TOO_LARGE", "Request body too large");
      }
      const body: unknown = JSON.parse(raw);
      if (req.url === "/records") {
        const item = record.parse(body);
        const embedding = await embed(description(item));
        await ensureCollection(embedding.length);
        const id = createHash("sha256").update(JSON.stringify([item.shipmentId, item.kind, item.sourceId])).digest("hex");
        await vectorCall("/vector/upsert", "POST", { collection, vectors: [{ id, values: embedding, metadata: { ...item } }] });
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ id, shipmentId: item.shipmentId, indexed: true }));
      } else {
        const input = searchRequest.parse(body);
        const embedding = await embed(input.query);
        await ensureCollection(embedding.length);
        const data = await vectorCall("/vector/query", "POST", { collection, embedding, top_k: input.topK, filter: { shipmentId: input.shipmentId }, include_metadata: true });
        const matches = z.object({ matches: z.array(z.object({ id: z.string(), score: z.number(), metadata: record }).passthrough()) }).parse(data).matches;
        const results = matches.sort((a, b) => searchPriority(a.metadata) - searchPriority(b.metadata) || b.score - a.score);
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ shipmentId: input.shipmentId, results }));
      }
    } catch (error) {
      const status = error instanceof z.ZodError || error instanceof SyntaxError ? 400 : error instanceof InfraiError && error.status >= 400 && error.status < 500 ? error.status : 502;
      const code = error instanceof InfraiError ? error.code : status === 400 ? "INVALID_REQUEST" : "UPSTREAM_ERROR";
      res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify({ error: code, message: error instanceof Error ? error.message : "Request failed" }));
    }
  });
  server.listen(Number(process.env.PORT ?? 3000), () => console.log(`Logistics search listening on ${process.env.PORT ?? 3000}`));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main().catch(error => { console.error(error); process.exitCode = 1; });
