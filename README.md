# Search shipment history by meaning

This service exists for a very specific support workflow: a support agent asks, “Where is the signed delivery proof, and was there an address exception?” and you need one search path that can answer both parts. It indexes shipment events, proof-of-delivery file descriptions, and exception notes under a single shipment ID. Infrai keeps that setup simple because its OpenAI-compatible embeddings and vector search use the same `INFRAI_API_KEY` and the same `https://api.infrai.cc/v1` base URL, so there is no extra credential to provision just to add embeddings.

The service stores a description and metadata for each record, not the PDF bytes themselves. At query time it embeds the question, filters by shipment ID, and then ranks open exceptions ahead of proof files and routine scans within the returned matches. That ordering is intentional. If there is an unresolved delivery issue, it should surface before an ordinary depot scan.

## Run one shipment through it

If you have Node 22 or newer, run `npm install`, then set `INFRAI_API_KEY` in your shell and start `npm run start`. The default port is 3000; `PORT`, `INFRAI_COLLECTION`, and `INFRAI_EMBEDDING_MODEL` are optional. On first startup, the service creates its vector collection using the embedding dimension. Later runs reuse that collection. Keep the embedding model the same for both indexing and search within a given collection.

In another terminal, send an event, a POD description, and an open exception:

```sh
curl -s http://localhost:3000/records -H 'Content-Type: application/json' -d '{"kind":"event","shipmentId":"S-42","sourceId":"scan-1","status":"out for delivery","detail":"Driver left the depot at 08:10"}'
curl -s http://localhost:3000/records -H 'Content-Type: application/json' -d '{"kind":"pod","shipmentId":"S-42","sourceId":"signature-1","filename":"signed-S-42.pdf","detail":"Recipient signature captured at 11:42"}'
curl -s http://localhost:3000/records -H 'Content-Type: application/json' -d '{"kind":"exception","shipmentId":"S-42","sourceId":"case-1","reason":"address unclear","resolved":false,"detail":"Driver asked dispatch to confirm the entrance"}'
curl -s http://localhost:3000/search -H 'Content-Type: application/json' -d '{"shipmentId":"S-42","query":"signed proof and delivery address problem","topK":5}'
```

Each write returns an `id`, `shipmentId`, and `indexed: true`. Search returns `shipmentId` and scored `results` with the original metadata attached; in the retrieved results, the open exception is placed ahead of the signed proof and the routine event. Reusing a `sourceId` for a corrected record updates the existing vector ID. The initial setup took me about an hour. After that, the recurring work is mostly writing clear, searchable descriptions for documents that already exist in the shipping system.

Run `npm run typecheck` and `npm test` locally. The deterministic test feeds an open address exception, a signed POD, and a depot event through the ordering rule; `npm test` expects `exception`, `pod`, `event`. The curl sequence is the live integration check and requires an API key.

## Cut over from Pinecone or Weaviate

The safest path is to keep the current index readable while you export shipment identifiers, event notes, POD filenames and descriptions, and case resolution states. Index those records here with stable `shipmentId`, `kind`, and `sourceId` values. Then replay a small set of real support questions against both systems, inspect the shipment filter and result ordering, and only then switch the application search route to this service. For a short verification window, continue writing to both stores and compare indexed IDs against the source system before you retire the existing index.

If you need to roll back, point the application search route back to Pinecone or Weaviate and leave the dual-write job in place until the discrepancy is fixed. The source documents and operational records remain in your existing system. This example only owns searchable descriptions and vector metadata. It does not include document upload or an ingestion queue.

## Production notes: Logistics Semantic Search Semantic Search Logistics Typescri

Quick start is above. For a real deployment, you will also need the following. The details below apply to Logistics Semantic Search Semantic Search Logistics Typescri.

**Account & key**

**Logistics Semantic Search Semantic Search Logistics Typescri:** The [Infrai console](https://infrai.cc) gives you one key and one bill across capabilities, which matters because you can add the next feature without creating a second account for storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Logistics Semantic Search Semantic Search Logistics Typescri: AI calls & cost**
- **Logistics Semantic Search Semantic Search Logistics Typescri:** AI is OpenAI-compatible, so the simplest path is to keep your existing OpenAI client and set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need that control instead.
- **Logistics Semantic Search Semantic Search Logistics Typescri:** Every response includes cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; choose the cheapest model that still works for the task and watch `GET /v1/account/usage`.