import { readFileSync, writeFileSync } from 'fs';
import { Result, ok, err, ResultAsync } from 'neverthrow';

type ExportableTweet = { fullText: string };
type FlattenError = { type: 'ParseError' | 'ReadError' | 'WriteError'; message: string };

function parseChunk(chunk: string): Result<ExportableTweet[], FlattenError> {
	try {
		const parsed = JSON.parse(chunk);
		if (!Array.isArray(parsed)) {
			return err({ type: 'ParseError', message: 'Expected array' });
		}
		return ok(parsed);
	} catch (e) {
		return err({ type: 'ParseError', message: String(e) });
	}
}

function flattenTweets(): Result<ExportableTweet[], FlattenError> {
	let content: string;
	try {
		content = readFileSync('data/tweets.json', 'utf-8');
	} catch (e) {
		return err({ type: 'ReadError', message: String(e) });
	}

	const chunks = content.split(/(?<=\])\s*(?=\[)/);

	const results = chunks
		.filter((chunk) => chunk.trim().length > 0)
		.map((chunk) => parseChunk(chunk));

	const errors = results.filter((r) => r.isErr());
	if (errors.length > 0) {
		console.warn(`Encountered ${errors.length} parse errors`);
	}

	const tweets = results
		.filter((r) => r.isOk())
		.flatMap((r) => r._unsafeUnwrap());

	return ok(tweets);
}

function flattenTextTweets(): Result<ExportableTweet[], FlattenError> {
	let content: string;
	try {
		content = readFileSync('data/tweets.txt', 'utf-8');
	} catch (e) {
		return err({ type: 'ReadError', message: String(e) });
	}

	const tweets = content
		.split('\n')
		.filter((line) => line.trim().length > 0)
		.map((line) => ({ fullText: line.trim() }));

	return ok(tweets);
}

function exportTextTweetsToJson(): void {
	const result = flattenTextTweets();

	if (result.isErr()) {
		console.error('Failed to flatten text tweets:', result.error);
		process.exit(1);
	}

	const tweets = result.value;

	try {
		writeFileSync('data/flattened-tweets.json', JSON.stringify(tweets, null, 2));
		console.log(`Successfully wrote ${tweets.length} tweets to data/flattened-tweets.json`);
	} catch (e) {
		console.error('Failed to write output:', e);
		process.exit(1);
	}
}

export { flattenTextTweets, exportTextTweetsToJson };

const result = flattenTextTweets();

if (result.isErr()) {
	console.error('Failed to flatten tweets:', result.error);
	process.exit(1);
}

const tweets = result.value;

try {
	writeFileSync('data/flattened-tweets.json', JSON.stringify(tweets, null, 2));
	console.log(`Successfully wrote ${tweets.length} tweets to data/flattened-tweets.json`);
} catch (e) {
	console.error('Failed to write output:', e);
	process.exit(1);
}
