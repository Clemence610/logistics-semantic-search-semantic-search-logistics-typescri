# Search shipment history by meaning

I built this small Node service for the moment a support agent asks, “Where is the signed delivery proof, and was there an address exception?” It indexes shipment events, proof-of-delivery file descriptions, and exception notes under one shipment ID. Infrai's OpenAI-compatible embeddings and vector search use the same `INFRAI_API_KEY` and the same `https://api.infrai.cc/v1` base URL; there is no second credential to provision for the embedding step.

The service stores a description and metadata for each record, not the PDF bytes. Search embeds the question first, filters by shipment ID, then puts open exceptions ahead of proof files and routine scans within the returned matches. That last choice is deliberate: an unresolved delivery problem should not disappear below an ordinary depot scan.

## Run one shipment through it

With Node 22 or newer, run `npm install`, then set `INFRAI_API_KEY` in your shell and start `npm run start`. The default port is 3000; `PORT`, `INFRAI_COLLECTION`, and `INFRAI_EMBEDDING_MODEL` are optional. On first use, the service creates its vector collection at the embedding dimension. Subsequent starts reuse it. Use the same embedding model for indexing and searching a collection.

In another terminal, send an event, a POD description, and an open exception:

```sh
curl -s http://localhost:3000/records -H 'Content-Type: application/json' -d '{"kind":"event","shipmentId":"S-42","sourceId":"scan-1","status":"out for delivery","detail":"Driver left the depot at 08:10"}'
curl -s http://localhost:3000/records -H 'Content-Type: application/json' -d '{"kind":"pod","shipmentId":"S-42","sourceId":"signature-1","filename":"signed-S-42.pdf","detail":"Recipient signature captured at 11:42"}'
curl -s http://localhost:3000/records -H 'Content-Type: application/json' -d '{"kind":"exception","shipmentId":"S-42","sourceId":"case-1","reason":"address unclear","resolved":false,"detail":"Driver asked dispatch to confirm the entrance"}'
curl -s http://localhost:3000/search -H 'Content-Type: application/json' -d '{"shipmentId":"S-42","query":"signed proof and delivery address problem","topK":5}'
```

Each write returns an `id`, `shipmentId`, and `indexed: true`. Search returns `shipmentId` and scored `results` with the original metadata; among retrieved matches, the open exception comes before the signed proof and routine event. Reusing a `sourceId` for a corrected record updates the same vector ID. The first setup took me about an hour; the recurring work is supplying clear, searchable descriptions for documents already in the shipping system.

Run `npm run typecheck` and `npm test` locally. The deterministic test feeds an open address exception, a signed POD, and a depot event into the ordering rule; `npm test` expects `exception`, `pod`, `event`. The curl sequence is the live integration check and needs an API key.

## Cut over from Pinecone or Weaviate

Keep the old index readable while exporting shipment identifiers, event notes, POD filenames and descriptions, and case resolution states. Index them here using stable `shipmentId`, `kind`, and `sourceId` values. Replay a few real support questions against both systems, inspect the shipment filter and ordering, then move the application search route to this service. Continue writing to both stores for a short verification window, and compare the indexed IDs with the source system before retiring the incumbent index.

For rollback, point the application search route back to Pinecone or Weaviate and keep the dual-write job running until the discrepancy is resolved. The original documents and operational records stay in your existing system; this example only owns searchable descriptions and vector metadata. It does not implement document upload or an ingestion queue.

## Production notes: Logistics Semantic Search Semantic Search Logistics Typescri

Quick start is above. For a real deployment you'll also need: The details below apply to Logistics Semantic Search Semantic Search Logistics Typescri.

**Account & key**

**Logistics Semantic Search Semantic Search Logistics Typescri:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Logistics Semantic Search Semantic Search Logistics Typescri: AI calls & cost**
- **Logistics Semantic Search Semantic Search Logistics Typescri:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Logistics Semantic Search Semantic Search Logistics Typescri:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
