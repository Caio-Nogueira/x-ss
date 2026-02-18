import { match, P } from "ts-pattern";
import { config } from "./config";
import { sendReply } from "./discord";
import { createClient, generateResponse } from "./opencode";
import { getSimilarContext } from "./semsearch";

const DISCORD_TOKEN = config.discordToken;
const BOT_USER_ID = config.botUserId;
const CHANNELS = config.channels;
const ALLOWED_USERS = config.allowedUsers;
const OPENCODE_URL = config.opencodeUrl;

const opencodeClient = createClient(OPENCODE_URL);

const GatewayOpcodes = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  RESUME: 6,
  RECONNECT: 7,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
} as const;

const GatewayIntents = {
  GUILD_MESSAGES: 1 << 9,
  MESSAGE_CONTENT: 1 << 15,
} as const;

const GatewayCloseCodes = {
  NORMAL: 1000,
} as const;

const GATEWAY_API = "https://discord.com/api/v10";
const GATEWAY_VERSION = 10;
const INTENTS = GatewayIntents.GUILD_MESSAGES | GatewayIntents.MESSAGE_CONTENT;

interface GatewayHello {
  op: typeof GatewayOpcodes.HELLO;
  d: { heartbeat_interval: number };
}

interface GatewayDispatch {
  op: typeof GatewayOpcodes.DISPATCH;
  t: string;
  s: number;
  d: unknown;
}

interface GatewayReconnect {
  op: typeof GatewayOpcodes.RECONNECT;
}

interface GatewayInvalidSession {
  op: typeof GatewayOpcodes.INVALID_SESSION;
  d: boolean;
}

interface MessageCreateData {
  id: string;
  channel_id: string;
  author: { id: string; username: string; global_name?: string; bot?: boolean };
  content: string;
  mentions: Array<{ id: string }>;
  timestamp: string;
  guild_id?: string;
}

interface ReadyEventData {
  session_id: string;
  resume_gateway_url: string;
}

type GatewayEvent =
  | GatewayHello
  | GatewayDispatch
  | GatewayReconnect
  | GatewayInvalidSession
  | { op: number; d?: unknown };

let ws: WebSocket | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let lastSequence: number | null = null;
let sessionId: string | null = null;
let resumeGatewayUrl: string | null = null;
let reconnectAttempts = 0;

async function getGatewayUrl(): Promise<string> {
  const res = await fetch(`${GATEWAY_API}/gateway/bot`, {
    headers: { Authorization: `Bot ${DISCORD_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(
      `Failed to get gateway URL: ${res.status} ${await res.text()}`,
    );
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}

function connect(gatewayUrl: string) {
  const url = `${gatewayUrl}?v=${GATEWAY_VERSION}&encoding=json`;
  console.log(`Connecting to ${url}`);

  ws = new WebSocket(url);

  ws.onopen = () => {
    console.log("WebSocket connected");
    reconnectAttempts = 0;
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data) as GatewayEvent;
    handleGatewayEvent(data);
  };

  ws.onclose = (event) => {
    console.log(`WebSocket closed: ${event.code} ${event.reason}`);
    cleanup();
    reconnect();
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
  };
}

function cleanup() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  ws = null;
}

async function reconnect() {
  reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000);
  console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);

  await new Promise((resolve) => setTimeout(resolve, delay));

  try {
    const gatewayUrl = resumeGatewayUrl || (await getGatewayUrl());
    connect(gatewayUrl);
  } catch (error) {
    console.error("Failed to reconnect:", error);
    reconnect();
  }
}

function handleGatewayEvent(event: GatewayEvent) {
  match(event)
    .with({ op: GatewayOpcodes.HELLO }, (e) => {
      handleHello((e as GatewayHello).d.heartbeat_interval);
    })
    .with({ op: GatewayOpcodes.HEARTBEAT_ACK }, () => {})
    .with({ op: GatewayOpcodes.DISPATCH }, (e) => {
      const dispatch = e as GatewayDispatch;
      lastSequence = dispatch.s;
      handleDispatch(dispatch);
    })
    .with({ op: GatewayOpcodes.RECONNECT }, () => {
      console.log("Reconnect requested by gateway");
      ws?.close(GatewayCloseCodes.NORMAL, "Reconnect requested");
    })
    .with({ op: GatewayOpcodes.INVALID_SESSION }, () => {
      console.log("Invalid session, re-identifying");
      sessionId = null;
      resumeGatewayUrl = null;
      identify();
    })
    .run();
}

function handleHello(heartbeatIntervalMs: number) {
  console.log(
    `Gateway hello received, heartbeat interval: ${heartbeatIntervalMs}ms`,
  );

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  heartbeatInterval = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({ op: GatewayOpcodes.HEARTBEAT, d: lastSequence }),
      );
    }
  }, heartbeatIntervalMs);

  if (sessionId && resumeGatewayUrl) {
    resume();
  } else {
    identify();
  }
}

function identify() {
  const payload = {
    op: GatewayOpcodes.IDENTIFY,
    d: {
      token: DISCORD_TOKEN,
      intents: INTENTS,
      properties: {
        os: "linux",
        browser: "bun",
        device: "bun",
      },
    },
  };
  ws?.send(JSON.stringify(payload));
  console.log("Identify sent");
}

function resume() {
  const payload = {
    op: GatewayOpcodes.RESUME,
    d: {
      token: DISCORD_TOKEN,
      session_id: sessionId,
      seq: lastSequence,
    },
  };
  ws?.send(JSON.stringify(payload));
  console.log("Resume sent");
}

function handleDispatch(event: GatewayDispatch) {
  match(event.t)
    .with("READY", () => {
      const data = event.d as ReadyEventData;
      sessionId = data.session_id;
      resumeGatewayUrl = data.resume_gateway_url;
      console.log(`Ready! Session ID: ${sessionId}`);
    })
    .with(P.union("MESSAGE_CREATE", "MESSAGE_UPDATE"), () => {
      handleMessageCreate(event.d as MessageCreateData);
    })
    .with(P._, () => {})
    .exhaustive();
}

function isBotMentioned(mentions: Array<{ id: string }>): boolean {
  return mentions.some((user) => user.id === BOT_USER_ID);
}

function handleMessageCreate(data: MessageCreateData) {
  // Anti-loop protection: never respond to own messages
  if (data.author.id === BOT_USER_ID) {
    return;
  }

  // Check if bot is mentioned - if so, respond to anyone anywhere
  if (isBotMentioned(data.mentions)) {
    console.log({
      type: "mention",
      author: data.author.global_name || data.author.username,
      content: data.content,
      timestamp: data.timestamp,
      channel_id: data.channel_id,
      guild_id: data.guild_id,
    });

    // Fire and forget - process asynchronously like a user would
    processMessageAsync(data).catch((err) => {
      console.error("Failed to process message:", err);
      // TODO: Add proper error handling and retry logic
    });
    return;
  }
  
  // Bot not mentioned - use whitelist logic
  // Check if channel is whitelisted
  if (!CHANNELS.includes(data.channel_id)) {
    return;
  }

  // Only respond to whitelisted users
  if (!ALLOWED_USERS.includes(data.author.id)) {
    return;
  }

  // Fire and forget - process asynchronously like a user would
  processMessageAsync(data).catch((err) => {
    console.error("Failed to process message:", err);
    // TODO: Add proper error handling and retry logic
  });
}

async function processMessageAsync(data: MessageCreateData) {
  // 1. Get similar context from semantic search
  const context = await getSimilarContext(data.content);
  console.log(`Found ${context.length} similar contexts`);

  // 2. Generate AI response using opencode
  const aiResponse = await generateResponse(
    opencodeClient,
    data.content,
    context,
  );
  console.log("Generated AI response");

  // 3. Send reply to Discord
  await sendReply(data.channel_id, data.id, aiResponse);
  console.log("Sent Discord reply");
}

async function main() {
  console.log("Starting Discord Gateway client...");

  try {
    const gatewayUrl = await getGatewayUrl();
    connect(gatewayUrl);
  } catch (error) {
    console.error("Failed to start:", error);
    process.exit(1);
  }
}

main();
