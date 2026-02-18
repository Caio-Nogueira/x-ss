import { readFileSync } from "fs";
import { join } from "path";

interface BotConfig {
	discordToken: string;
	botUserId: string;
	semsearchUrl: string;
	opencodeUrl: string;
	channels: string[];
	allowedUsers: string[];
}

function loadConfig(): BotConfig {
	const configPath = join(process.cwd(), "config.json");
	
	try {
		const configFile = readFileSync(configPath, "utf-8");
		const config = JSON.parse(configFile) as BotConfig;
		
		// Basic validation
		if (!config.discordToken || !config.botUserId || !config.semsearchUrl || !config.opencodeUrl) {
			throw new Error("Missing required config fields: discordToken, botUserId, semsearchUrl, opencodeUrl");
		}
		
		if (!Array.isArray(config.channels) || config.channels.length === 0) {
			throw new Error("Config must include at least one channel in the channels array");
		}
		
		if (!Array.isArray(config.allowedUsers) || config.allowedUsers.length === 0) {
			throw new Error("Config must include at least one user in the allowedUsers array");
		}
		
		return config;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			console.error(`Config file not found at ${configPath}`);
			console.error("Please copy config.example.json to config.json and fill in your values");
		} else {
			console.error("Failed to load config:", (error as Error).message);
		}
		process.exit(1);
	}
}

export const config = loadConfig();
