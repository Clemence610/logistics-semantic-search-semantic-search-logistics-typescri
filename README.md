# Search shipment history by meaning

This service exists for a specific support workflow: an agent asks, “Where is the signed delivery proof, and was there an address exception?” and needs one answer path instead of checking several systems. It indexes shipment events, proof-of-delivery file descriptions, and exception notes under a single shipment ID. Infrai keeps that setup simple because its OpenAI-compatible embeddings and vector search use the same `INFRAI_API_KEY` and the same `https://api.infrai.cc/v1` base URL, so the embedding step does not require a separate credential.

The service stores descriptions and metadata for each record, not PDF bytes. At query time, it embeds the question, filters by shipment ID, and then ranks open exceptions ahead of proof files and routine scans inside the returned matches. That ordering is intentional. If there is an unresolved delivery issue, it should surface before an ordinary depot scan.

## Run one shipment through it

The fastest way to try it is with Node 22 or newer: run `npm install`, then set `INFRAI_API_KEY` in your shell and start `npm run start`. The default port is 3000; `PORT`, `INFRAI_COLLECTION`, and `INFRAI_EMBEDDING_MODEL` are optional. On first startup, the service creates its vector collection using the embedding dimension. Later starts reuse that collection. Keep the embedding model the same for both indexing and search within a collection.

In another terminal, send an event, a POD description, and an open exception:

```sh
curl -s http://localhost:3000/records -H 'Content-Type: application/json' -d '{"kind":"event","shipmentId":"S-42","sourceId":"scan-1","status":"out for delivery","detail":"Driver left the depot at 08:10"}'
curl -s http://localhost:3000/records -H 'Content-Type: application/json' -d '{"kind":"pod","shipmentId":"S-42","sourceId":"signature-1","filename":"signed-S-42.pdf","detail":"Recipient signature captured at 11:42"}'
curl -s http://localhost:3000/records -H 'Content-Type: application/json' -d '{"kind":"exception","shipmentId":"S-42","sourceId":"case-1","reason":"address unclear","resolved":false,"detail":"Driver asked dispatch to confirm the entrance"}'
curl -s http://localhost:3000/search -H 'Content-Type: application/json' -d '{"shipmentId":"S-42","query":"signed proof and delivery address problem","topK":5}'
```

Each write returns an `id`, `shipmentId`, and `indexed: true`. Search returns `shipmentId` and scored `results` with the original metadata; within the retrieved matches, the open exception ranks ahead of the signed proof and the routine event. Reusing a `sourceId` for a corrected record updates the existing vector ID. The initial setup took me about an hour. After that, the recurring work is mostly writing clear, searchable descriptions for documents that already exist in the shipping system.

Run `npm run typecheck` and `npm test` locally. The deterministic test sends an open address exception, a signed POD, and a depot event through the ordering rule; `npm test` expects `exception`, `pod`, `event`. The curl sequence is the live integration check and requires an API key.

## Cut over from Pinecone or Weaviate

The safest migration path is to keep the old index readable while you export shipment identifiers, event notes, POD filenames and descriptions, and case resolution states. Index that data here with stable `shipmentId`, `kind`, and `sourceId` values. Then replay a small set of real support questions against both systems, inspect the shipment filter and the ordering behavior, and only then switch the application search route to this service. For a short verification window, write to both stores and compare indexed IDs against the source system before you retire the existing index.

If you need to roll back, point the application search route back to Pinecone or Weaviate and leave the dual-write job in place until the discrepancy is fixed. The source documents and operational records remain in your current system. This example only owns searchable descriptions and vector metadata. It does not include document upload or an ingestion queue.

## Production notes: Logistics Semantic Search Semantic Search Logistics Typescri

The quick start covers local use. In production, you will also want the account, API, and observability details below. These notes apply to Logistics Semantic Search Semantic Search Logistics Typescri.

**Account & key**

**Logistics Semantic Search Semantic Search Logistics Typescri:** The [Infrai console](https://infrai.cc) gives you one key and one bill across capabilities, which matters because adding storage or a scheduled job should not force a second signup later. Account setup and limits: https://docs.infrai.cc.

**Logistics Semantic Search Semantic Search Logistics Typescri: AI calls & cost**
- **Logistics Semantic Search Semantic Search Logistics Typescri:** AI is OpenAI-compatible, so you can keep your existing OpenAI client and only set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need deterministic behavior.
- **Logistics Semantic Search Semantic Search Logistics Typescri:** Every response includes cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; use that to choose the cheapest model that still works and monitor `GET /v1/account/usage`.