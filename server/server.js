import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { WebSocketServer } from "ws";

const port = Number(process.env.PORT ?? 8787);
const root = join(process.cwd(), "dist");
const players = new Map();

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  const requested = normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(root, requested === "/" ? "index.html" : requested);

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(root, "index.html");
  }

  response.setHeader("Content-Type", mime[extname(filePath)] ?? "application/octet-stream");
  createReadStream(filePath).pipe(response);
});

const wss = new WebSocketServer({ server });

wss.on("connection", (socket) => {
  const id = crypto.randomUUID();
  const player = {
    id,
    name: `Pilot ${String(id).slice(0, 4)}`,
    position: [0, 80, 0],
    quaternion: [0, 0, 0, 1],
    health: 200,
    destroyed: false
  };

  players.set(id, { socket, player });
  send(socket, { type: "welcome", id, players: [...players.values()].map((entry) => entry.player) });
  broadcast({ type: "playerJoined", player }, id);

  socket.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (message.type === "state") {
      player.position = sanitizeTuple(message.position, 3, player.position);
      player.quaternion = sanitizeTuple(message.quaternion, 4, player.quaternion);
      player.health = Number.isFinite(message.health) ? message.health : player.health;
      broadcast({ type: "state", id, position: player.position, quaternion: player.quaternion, health: player.health }, id);
    }

    if (message.type === "shot") {
      broadcast(
        {
          type: "shot",
          ownerId: id,
          shotId: String(message.shotId ?? ""),
          position: sanitizeTuple(message.position, 3, [0, 80, 0]),
          velocity: sanitizeTuple(message.velocity, 3, [0, 0, -1])
        },
        id
      );
    }

    if (message.type === "hit") {
      const target = players.get(String(message.targetId));
      if (!target || target.player.destroyed) return;
      target.player.destroyed = true;
      target.player.health = 0;
      const by = players.has(String(message.by)) ? String(message.by) : id;
      broadcast({ type: "destroyed", id: target.player.id, by });
      send(target.socket, { type: "destroyed", id: target.player.id, by });
    }

    if (message.type === "crash") {
      player.destroyed = true;
      player.health = 0;
      broadcast({ type: "destroyed", id, by: null });
    }
  });

  socket.on("close", () => {
    players.delete(id);
    broadcast({ type: "playerLeft", id });
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`LAN multiplayer server running at http://localhost:${port}/`);
});

function send(socket, message) {
  if (socket.readyState === 1) socket.send(JSON.stringify(message));
}

function broadcast(message, exceptId) {
  for (const [id, entry] of players) {
    if (id !== exceptId) send(entry.socket, message);
  }
}

function sanitizeTuple(value, length, fallback) {
  if (!Array.isArray(value) || value.length !== length) return fallback;
  const tuple = value.map(Number);
  return tuple.every(Number.isFinite) ? tuple : fallback;
}
