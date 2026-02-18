import tweets from '../data/flattened-tweets.json';

interface Tweet {
	fullText: string;
}

const EMBEDDING_MODEL = '@cf/google/embeddinggemma-300m';
const BATCH_SIZE = 100;

export async function ingest(env: Env): Promise<Response> {
	const startTime = Date.now();
	let processed = 0;
	let failed = 0;

	const allTweets = tweets as Tweet[];

	for (let i = 0; i < allTweets.length; i += BATCH_SIZE) {
		const batch = allTweets.slice(i, i + BATCH_SIZE);
		const texts = batch.map((t) => t.fullText);

		try {
			const embeddings = await env.AI.run(EMBEDDING_MODEL, { text: texts });

			const vectors: VectorizeVector[] = embeddings.data.map((embedding, idx) => ({
				id: `tweet-${i + idx}`,
				values: embedding,
				metadata: {
					text: batch[idx].fullText,
				},
			}));

			await env.VECTORIZE.upsert(vectors);
			processed += batch.length;
		} catch (error) {
			failed += batch.length;
			console.error(`Batch ${i}-${i + batch.length} failed:`, error);
		}
	}

	const duration = Date.now() - startTime;

	return Response.json({
		success: true,
		processed,
		failed,
		total: allTweets.length,
		durationMs: duration,
	});
}
