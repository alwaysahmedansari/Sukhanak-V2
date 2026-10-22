import express from "express";
const app = express();
import env from "./utils/envalid";
import logger from "./middlewares/logger";
import postRouter from "./routers/post";
import authRouter from "./routers/auth";
import userRouter from "./routers/user";
import searchRouter from "./routers/search";
import cors from "cors";
import { errorHandler } from "./middlewares/errorHandler";
import { createServer } from "http";
import { Server } from "socket.io";
import { exec, query } from "./db";
import { isId } from "./utils/helpers";
const server = createServer(app);

const isProd = !env.DEV;
if (isProd) {
  app.use(logger);
}
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

const ONLINE_USER_TO_SOCKET_ID_MAP = new Map<string, string>();

const io = new Server(server, {
  cors: {
    origin: env.CLIENT_URL,
  },
});

io.on("connection", (socket) => {
  console.log("a user connected with id : ", socket.id);
  socket.on("start", ({ userId }) => {
    ONLINE_USER_TO_SOCKET_ID_MAP.set(userId, socket.id);
  });
  socket.on("notify", ({ userId }) => {
    const room = ONLINE_USER_TO_SOCKET_ID_MAP.get(userId);
    if (room) socket.to(room).emit("haveNotifications", true);
  });
  socket.on("checkNotifications", async (payload) => {
    try {
      const userId = payload?.userId;
      let count = 0;
      if (isId(userId)) {
        const [row] = await query<{ unread: number }>(
          "SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0",
          [userId]
        );
        count = Number(row?.unread ?? 0);
      }
      socket.emit("notificationsCount", { count });
    } catch (err) {
      console.error(err);
    }
  });
  socket.on("readAll", async (payload) => {
    try {
      const userId = payload?.userId;
      if (!isId(userId)) return;
      await exec("UPDATE notifications SET is_read = 1 WHERE user_id = ?", [
        userId,
      ]);
    } catch (err) {
      console.error(err);
    }
  });
  socket.on("disconnect", (reason) => {
    console.log(reason, socket.id);
    ONLINE_USER_TO_SOCKET_ID_MAP.forEach((socketId, userId) => {
      if (socketId === socket.id) ONLINE_USER_TO_SOCKET_ID_MAP.delete(userId);
    });
  });
});

app.get("/test", (req, res) => {
  res.send("Hello from server side");
});

app.use("/post", postRouter);
app.use("/auth", authRouter);
app.use("/user", userRouter);
app.use("/search", searchRouter);

app.use(errorHandler);

export { server };
