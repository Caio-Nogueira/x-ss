import { createOpencodeClient } from "@opencode-ai/sdk";
import { readFileSync } from "fs";
import { join } from "path";

interface SearchResult {
	text: string;
	score: number;
}

const SYSTEM_PROMPT_TEMPLATE = readFileSync(join(__dirname, "system-prompt.txt"), "utf-8");

export function createClient(url: string) {
	return createOpencodeClient({ baseUrl: url });
}

export type OpencodeClient = ReturnType<typeof createClient>;

export async function generateResponse(
	client: OpencodeClient,
	userMessage: string,
	context: SearchResult[],
): Promise<string> {
	// Format context for the prompt
	const contextText =
		context.length > 0
			? context.map((item, idx) => `[${idx + 1}] (relevance: ${(item.score * 100).toFixed(1)}%)\n${item.text}`).join("\n\n")
			: "No similar conversations found.";

	const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace("{context}", contextText);

	// Create a new session for this message
	const sessionResult = await client.session.create({
		body: {
			title: `Discord message: ${userMessage.slice(0, 50)}...`,
		},
	});

	if (sessionResult.error || !sessionResult.data) {
		throw new Error(`Failed to create session: ${JSON.stringify(sessionResult.error) || "Unknown error"}`);
	}

	const sessionId = sessionResult.data.id;

	// Make the inference
	const result = await client.session.prompt({
		path: { id: sessionId },
		body: {
			parts: [
				{ type: "text", text: systemPrompt },
				{ type: "text", text: `User: ${userMessage}` },
			],
		},
	});

	if (result.error || !result.data) {
		throw new Error(`Failed to generate response: ${JSON.stringify(result.error) || "Unknown error"}`);
	}

	// Extract the response text
	const responseText = result.data.parts
		.filter((part) => part.type === "text")
		.map((part) => (part as { text: string }).text)
		.join("\n");

	if (!responseText) {
		throw new Error("No text response received from opencode");
	}

	return responseText;
}
