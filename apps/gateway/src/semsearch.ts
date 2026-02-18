import { config } from "./config";

interface SearchResult {
	text: string;
	score: number;
}

interface VectorizeMatch {
	id: string;
	score: number;
	metadata?: {
		text: string;
	};
}

const SEMSEARCH_URL = config.semsearchUrl;

export async function getSimilarContext(message: string): Promise<SearchResult[]> {
	const response = await fetch(SEMSEARCH_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ message }),
	});

	if (!response.ok) {
		throw new Error(`Semsearch request failed: ${response.status} ${await response.text()}`);
	}

	const matches = (await response.json()) as VectorizeMatch[];

	return matches
		.filter((match) => match.metadata?.text)
		.map((match) => ({
			text: match.metadata!.text,
			score: match.score,
		}));
}
