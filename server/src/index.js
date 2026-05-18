/**
 * 摇摇赛马 — Colyseus 服务端入口
 */

import { Server, LobbyRoom } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import { createServer } from "http";
import cors from "cors";
import { RaceRoom } from "./RaceRoom.js";

const PORT = Number(process.env.PORT) || 2567;

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// 注册大厅房间（内置，自动推送房间列表变化）
gameServer.define("lobby", LobbyRoom);

// 注册赛马房间（启用实时列表，让 LobbyRoom 能发现它）
gameServer.define("race", RaceRoom).enableRealtimeListing();

httpServer.listen(PORT, () => {
  console.log(`[摇摇赛马] Colyseus 服务端已启动`);
  console.log(`[摇摇赛马] WebSocket: ws://localhost:${PORT}`);
  console.log(`[摇摇赛马] 大厅 + 赛马房间已注册`);
});
