import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import { exec, newId, query, queryOne, transaction } from "../db";
import ServerError from "../utils/ServerError";
import env from "../utils/envalid";
import { JWTPayload } from "../middlewares/auth";
import {
  findUserRows,
  loadLists,
  loadUsers,
  NotificationRow,
  toNotification,
  UserRow,
} from "../utils/loaders";

// loads many users in a few queries and keeps the original order
async function findUsersInOrder(ids: string[]) {
  const users = await loadUsers(await findUserRows(ids));
  const byId = new Map<string, any>();
  users.forEach((user) => byId.set(user._id, user));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

async function userExists(id: string | undefined) {
  return Boolean(await queryOne("SELECT id FROM users WHERE id = ?", [id]));
}

export const editUser = asyncHandler(async (req, res, next) => {
  const { userId } = req;
  if (!(await userExists(userId))) throw new ServerError(400, "User doesn't exist");
  const updates: Record<string, string> = {};
  for (const key of ["name", "bio", "avatar"]) {
    const value = req.body?.[key];
    if (typeof value === "string" && (key !== "name" || value.trim()))
      updates[key] = value;
  }
  if (!Object.keys(updates).length)
    throw new ServerError(400, "Nothing to update");
  if (updates.name && updates.name.length > 255)
    throw new ServerError(400, "Name is too long (max 255 characters)");
  // the column names come from the fixed list above, never from the request
  const columns = Object.keys(updates);
  await exec(
    `UPDATE users SET ${columns.map((column) => `${column} = ?`).join(", ")}, updated_at = ?
     WHERE id = ?`,
    [...columns.map((column) => updates[column]), new Date(), userId]
  );
  res.send({ success: true });
});

export const deleteUser = asyncHandler(async (req, res, next) => {
  const { userId } = req;
  if (!(await userExists(userId))) throw new ServerError(400, "User doesn't exist");
  const deleted = await transaction(async (conn) => {
    // the person's posts, with everything attached to them
    const myPosts = "SELECT id FROM posts WHERE user_id = ?";
    for (const table of [
      "post_tags",
      "post_votes",
      "post_comments",
      "list_posts",
      "ignored_posts",
    ]) {
      await exec(`DELETE FROM ${table} WHERE post_id IN (${myPosts})`, [userId], conn);
    }
    await exec("DELETE FROM posts WHERE user_id = ?", [userId], conn);
    // the person's own activity on the site
    await exec("DELETE FROM post_votes WHERE user_id = ?", [userId], conn);
    await exec("DELETE FROM post_comments WHERE user_id = ?", [userId], conn);
    await exec(
      "DELETE FROM follows WHERE follower_id = ? OR following_id = ?",
      [userId, userId],
      conn
    );
    await exec("DELETE FROM user_interests WHERE user_id = ?", [userId], conn);
    await exec("DELETE FROM ignored_posts WHERE user_id = ?", [userId], conn);
    await exec(
      "DELETE FROM muted_authors WHERE user_id = ? OR author_id = ?",
      [userId, userId],
      conn
    );
    await exec(
      "DELETE FROM list_posts WHERE list_id IN (SELECT id FROM user_lists WHERE user_id = ?)",
      [userId],
      conn
    );
    await exec("DELETE FROM user_lists WHERE user_id = ?", [userId], conn);
    await exec(
      "DELETE FROM notifications WHERE user_id = ? OR actor_id = ?",
      [userId, userId],
      conn
    );
    await exec("DELETE FROM tokens WHERE user_id = ?", [userId], conn);
    return exec("DELETE FROM users WHERE id = ?", [userId], conn);
  });
  res.send({ success: deleted.affectedRows == 1 });
});

export const followUser = asyncHandler(async (req, res, next) => {
  const { userId: userTo } = req.params;
  const { userId } = req;
  if (userTo === userId)
    throw new ServerError(400, "You can't follow yourself");
  if (!(await userExists(userTo))) throw new ServerError(404, "User does not exist");
  const me = await queryOne<{ name: string; avatar: string | null }>(
    "SELECT name, avatar FROM users WHERE id = ?",
    [userId]
  );
  if (!me) {
    res.send({ success: false });
    return;
  }
  const now = new Date();
  const added = await exec(
    "INSERT IGNORE INTO follows (follower_id, following_id, created_at) VALUES (?, ?, ?)",
    [userId, userTo, now]
  );
  if (added.affectedRows != 1) {
    // already following
    res.send({ success: false });
    return;
  }
  await exec(
    `INSERT INTO notifications
       (id, user_id, actor_id, username, avatar, message, post_id, post_title, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 0, ?)`,
    [newId(), userTo, userId, me.name, me.avatar, "started following you", now]
  );
  res.send({ success: true });
});

export const unfollowUser = asyncHandler(async (req, res, next) => {
  const { userId: userTo } = req.params;
  const { userId } = req;
  if (!(await userExists(userTo))) throw new ServerError(404, "User does not exist");
  const removed = await exec(
    "DELETE FROM follows WHERE follower_id = ? AND following_id = ?",
    [userId, userTo]
  );
  res.send({ success: removed.affectedRows == 1 });
});

export const suggestUsers = asyncHandler(async (req, res, next) => {
  const { userId } = req;
  const rows = await query<UserRow>(
    `SELECT u.* FROM users u
     WHERE u.id <> ?
       AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.following_id = u.id)
     ORDER BY u.created_at, u.id
     LIMIT 3`,
    [userId, userId]
  );
  res.send(await loadUsers(rows));
});

export const getUser = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  // the email and saved lists are only returned to the person they belong to
  let isOwner = false;
  const token = req.headers["authorization"]?.split(" ")[1];
  if (token) {
    try {
      isOwner = (<JWTPayload>jwt.verify(token, env.JWT_SECRET))._id === userId;
    } catch {
      isOwner = false;
    }
  }
  const row = await queryOne<UserRow>("SELECT * FROM users WHERE id = ?", [userId]);
  if (!row) throw new ServerError(400, "User doesn't exist");
  const [user] = await loadUsers([row], { owner: isOwner });
  res.json(user);
});

export const getUserIntrests = asyncHandler(async (req, res, next) => {
  if (!(await userExists(req.userId))) {
    res.send(null);
    return;
  }
  const topics = await query<{ topic: string }>(
    "SELECT topic FROM user_interests WHERE user_id = ? ORDER BY created_at",
    [req.userId]
  );
  res.send({ _id: req.userId, intrests: topics.map((item) => item.topic) });
});

export const addUserIntrests = asyncHandler(async (req, res, next) => {
  const { topic } = req.query;
  const { userId } = req;
  if (typeof topic !== "string" || !topic.trim() || topic.length > 100)
    throw new ServerError(400, "A valid topic is required");
  const added = await exec(
    "INSERT IGNORE INTO user_interests (user_id, topic, created_at) VALUES (?, ?, ?)",
    [userId, topic, new Date()]
  );
  res.send({
    success: added.affectedRows == 1,
  });
});

export const removeUserIntrests = asyncHandler(async (req, res, next) => {
  const { topic } = req.query;
  const { userId } = req;
  if (typeof topic !== "string" || !topic)
    throw new ServerError(400, "A valid topic is required");
  const removed = await exec(
    "DELETE FROM user_interests WHERE user_id = ? AND topic = ?",
    [userId, topic]
  );
  res.send({
    success: removed.affectedRows == 1,
  });
});

// totdo pagination
export const getNotifications = asyncHandler(async (req, res, next) => {
  const rows = await query<NotificationRow>(
    "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC",
    [req.userId]
  );
  res.send(rows.map(toNotification));
});

export const getAllFollowers = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  if (!userId) throw new ServerError(400, "No user id provided");
  if (!(await userExists(userId))) throw new ServerError(400, "User does not exist");
  const rows = await query<{ id: string }>(
    "SELECT follower_id AS id FROM follows WHERE following_id = ? ORDER BY created_at",
    [userId]
  );
  res.send(await findUsersInOrder(rows.map((row) => row.id)));
});

export const getAllFollowings = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  if (!userId) throw new ServerError(400, "No user id provided");
  if (!(await userExists(userId))) throw new ServerError(400, "User does not exist");
  const rows = await query<{ id: string }>(
    "SELECT following_id AS id FROM follows WHERE follower_id = ? ORDER BY created_at",
    [userId]
  );
  res.send(await findUsersInOrder(rows.map((row) => row.id)));
});

export const getAllList = asyncHandler(async (req, res, next) => {
  const { userId } = req;
  const lists = await loadLists([userId]);
  res.send({ lists: lists.get(userId) ?? [] });
});
