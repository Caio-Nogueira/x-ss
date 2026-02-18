import { config } from "./config";

const DISCORD_TOKEN = config.discordToken;
const GATEWAY_API = "https://discord.com/api/v10";

export async function sendReply(channelId: string, messageId: string, content: string): Promise<void> {
	const url = `${GATEWAY_API}/channels/${channelId}/messages`;

	const response = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bot ${DISCORD_TOKEN}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			content,
			message_reference: {
				message_id: messageId,
			},
		}),
	});

	if (!response.ok) {
		throw new Error(`Failed to send Discord reply: ${response.status} ${await response.text()}`);
	}
}
