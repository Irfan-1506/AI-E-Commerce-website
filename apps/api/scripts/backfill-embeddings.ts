// Run once after enabling pgvector, to embed products that existed before
// semantic search was added (e.g. from prisma/seed.ts).
//   npx ts-node --transpile-only scripts/backfill-embeddings.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';

async function main() {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error('VOYAGE_API_KEY not set');

  const products = await prisma.product.findMany({ select: { id: true, name: true, description: true } });
  console.log(`Embedding ${products.length} products...`);

  // Voyage accepts batches — chunk to stay well under any per-request limits.
  const BATCH_SIZE = 50;
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const res = await fetch(VOYAGE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: batch.map((p) => `${p.name}\n\n${p.description}`),
        model: 'voyage-3',
        input_type: 'document',
      }),
    });
    if (!res.ok) throw new Error(`Voyage API error: ${res.status} ${await res.text()}`);
    const { data } = await res.json();

    for (let j = 0; j < batch.length; j++) {
      const vectorLiteral = `[${data[j].embedding.join(',')}]`;
      await prisma.$executeRawUnsafe(
        `UPDATE "Product" SET embedding = $1::vector WHERE id = $2`,
        vectorLiteral,
        batch[j].id,
      );
    }
    console.log(`  ...${Math.min(i + BATCH_SIZE, products.length)}/${products.length}`);
  }
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
