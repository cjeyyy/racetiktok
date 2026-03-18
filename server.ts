import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";
import { WebcastPushConnection } from "tiktok-live-connector";
import path from "path";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer);
  const PORT = 3000;

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Socket.io logic
  io.on("connection", (socket) => {
    let tiktokConnection: WebcastPushConnection | null = null;

    socket.on("connect_tiktok", async (username) => {
      if (tiktokConnection) {
        tiktokConnection.disconnect();
      }

      try {
        tiktokConnection = new WebcastPushConnection(username);
        
        tiktokConnection.on("chat", (data) => {
          socket.emit("tiktok_chat", {
            uniqueId: data.uniqueId,
            comment: data.comment,
          });
        });

        tiktokConnection.on("gift", (data) => {
          socket.emit("tiktok_gift", {
            uniqueId: data.uniqueId,
            giftId: data.giftId,
            giftName: data.giftName,
            amount: data.amount,
            giftPictureUrl: data.giftPictureUrl || (data.gift && data.gift.image && data.gift.image.urlList ? data.gift.image.urlList[0] : '')
          });
        });

        tiktokConnection.on("error", (err) => {
          console.error("TikTok connection error:", err);
          socket.emit("tiktok_error", { message: err.message || "Connection error" });
        });

        await tiktokConnection.connect();
        socket.emit("tiktok_connected", { username });
      } catch (err: any) {
        console.error("Failed to connect to TikTok:", err);
        socket.emit("tiktok_error", { message: err.message || "Failed to connect" });
      }
    });

    socket.on("disconnect_tiktok", () => {
      if (tiktokConnection) {
        tiktokConnection.disconnect();
        tiktokConnection = null;
        socket.emit("tiktok_disconnected");
      }
    });

    socket.on("disconnect", () => {
      if (tiktokConnection) {
        tiktokConnection.disconnect();
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
