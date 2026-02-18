const EMBEDDING_MODEL = '@cf/google/embeddinggemma-300m';

export default {
	async fetch(request, env, ctx): Promise<Response> {
		if (request.method !== 'POST') {
			return new Response('Method Not Allowed', { status: 405 });
		}

		let body: { message?: string };
		try {
			body = await request.json();
		} catch {
			return new Response('Invalid JSON body', { status: 400 });
		}

		const query = body.message;
		if (!query || typeof query !== 'string') {
			return new Response('Missing or invalid "message" field', { status: 400 });
		}

		const { data } = await env.AI.run(EMBEDDING_MODEL, { text: [query] });

		const results = await env.VECTORIZE.query(data[0], {
			topK: 10,
			returnMetadata: 'all'
		});

		return Response.json(results.matches);
	},
} satisfies ExportedHandler<Env>;
