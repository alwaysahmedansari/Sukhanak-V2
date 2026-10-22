import asyncHandler from "express-async-handler";
import { Db, exec, newId, query, queryOne, transaction } from "../db";
import ServerError from "../utils/ServerError";
import { isId, parseTags } from "../utils/helpers";
import {
  findUserRows,
  loadPosts,
  loadUsers,
  PostRow,
  UserRow,
} from "../utils/loaders";

// hides posts the person chose to ignore and authors they muted
// (needs the viewer's id twice, and the posts table named "p")
const NOT_HIDDEN = `
  NOT EXISTS (SELECT 1 FROM ignored_posts i WHERE i.user_id = ? AND i.post_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM muted_authors m WHERE m.user_id = ? AND m.author_id = p.user_id)`;

// reads title / markdown / tags from the request and builds the saved fields
function buildPostFields(body: any) {
  const { title, markdown } = body ?? {};
  if (
    typeof title !== "string" ||
    !title.trim() ||
    typeof markdown !== "string" ||
    !markdown.trim()
  )
    throw new ServerError(400, "Title and content are required");
  if (title.length > 1000)
    throw new ServerError(400, "Title is too long (max 1000 characters)");
  const tags = parseTags(body.tags);
  if (tags.some((tag) => tag.length > 100))
    throw new ServerError(400, "A tag is too long (max 100 characters)");
  const withoutCode = markdown.replace(/<code>[\s\S]*?<\/code>/g, "");
  const imgMatch = /<img.*?src=['"](.*?)['"]/.exec(markdown);
  const htmlTagRegex = /<(?:"[^"]*"['"]*|'[^']*'['"]*|[^'">])+>/g;
  return {
    title,
    markdown,
    tags,
    image: imgMatch ? imgMatch[1] : null,
    summary: withoutCode.replace(htmlTagRegex, ""),
  };
}

// makes sure every tag exists in the "tags" table
async function saveNewTags(tags: string[], db?: Db) {
  const now = new Date();
  for (const name of tags) {
    await exec(
      "INSERT IGNORE INTO tags (id, name, created_at) VALUES (?, ?, ?)",
      [newId(), name, now],
      db
    );
  }
}

// replaces the tags of a post (keeps their order)
async function replacePostTags(db: Db, postId: string, tags: string[]) {
  await exec("DELETE FROM post_tags WHERE post_id = ?", [postId], db);
  for (let i = 0; i < tags.length; i++) {
    await exec(
      "INSERT INTO post_tags (post_id, tag, sort_order) VALUES (?, ?, ?)",
      [postId, tags[i], i],
      db
    );
  }
}

export const getUserPost = asyncHandler(async (req, res, next) => {
  const rows = await query<PostRow>(
    "SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC, id DESC",
    [req.params.userId]
  );
  res.send(await loadPosts(rows));
});

// todo pagination
export const getHomePost = asyncHandler(async (req, res, next) => {
  const { userId } = req;
  const rows = await query<PostRow>(
    `SELECT p.* FROM posts p
     WHERE p.user_id <> ? AND ${NOT_HIDDEN}
     ORDER BY p.created_at DESC, p.id DESC`,
    [userId, userId, userId]
  );
  res.send(await getPostsWithUser(rows));
});

export const getPost = asyncHandler(async (req, res, next) => {
  const row = await queryOne<PostRow>("SELECT * FROM posts WHERE id = ?", [
    req.params.postId,
  ]);
  if (!row) throw new ServerError(400, "No such post found!");
  const [post] = await loadPosts([row]);
  const [user] = await loadUsers(await findUserRows([row.user_id]));
  res.send({ post, user });
});

export const writePost = asyncHandler(async (req, res, next) => {
  const { userId } = req;
  const fields = buildPostFields(req.body);
  const id = newId();
  const now = new Date();
  await transaction(async (conn) => {
    await exec(
      `INSERT INTO posts (id, user_id, title, markdown, image, summary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, fields.title, fields.markdown, fields.image, fields.summary, now, now],
      conn
    );
    await saveNewTags(fields.tags, conn);
    await replacePostTags(conn, id, fields.tags);
  });
  const row = await queryOne<PostRow>("SELECT * FROM posts WHERE id = ?", [id]);
  const [post] = await loadPosts(row ? [row] : []);
  res.send(post);
});

export const editPost = asyncHandler(async (req, res, next) => {
  const { userId } = req;
  const { postId } = req.params;
  const post = await queryOne<PostRow>("SELECT * FROM posts WHERE id = ?", [postId]);
  if (!post) throw new ServerError(400, "No such post found");
  if (post.user_id !== userId) throw new ServerError(403, "Not Allowed");
  const fields = buildPostFields(req.body);
  await transaction(async (conn) => {
    await exec(
      `UPDATE posts SET title = ?, markdown = ?, image = ?, summary = ?, updated_at = ?
       WHERE id = ?`,
      [fields.title, fields.markdown, fields.image, fields.summary, new Date(), postId],
      conn
    );
    await saveNewTags(fields.tags, conn);
    await replacePostTags(conn, postId, fields.tags);
  });
  res.send({ success: true });
});

export const deletePost = asyncHandler(async (req, res, next) => {
  const { userId } = req;
  const { postId } = req.params;
  const post = await queryOne<PostRow>("SELECT * FROM posts WHERE id = ?", [postId]);
  if (!post) throw new ServerError(400, "No such post found");
  if (post.user_id !== userId) throw new ServerError(403, "Not Allowed");
  const deleted = await transaction(async (conn) => {
    for (const table of [
      "post_tags",
      "post_votes",
      "post_comments",
      "list_posts",
      "ignored_posts",
    ]) {
      await exec(`DELETE FROM ${table} WHERE post_id = ?`, [postId], conn);
    }
    return exec("DELETE FROM posts WHERE id = ?", [postId], conn);
  });
  res.send({ success: deleted.affectedRows == 1 });
});

export const suggestTopPosts = asyncHandler(async (req, res, next) => {
  const { userId } = req;
  const rows = await query<PostRow>(
    `SELECT p.* FROM posts p
     WHERE p.user_id <> ? AND ${NOT_HIDDEN}
     ORDER BY (SELECT COUNT(*) FROM post_votes v WHERE v.post_id = p.id) DESC,
              p.created_at DESC, p.id DESC
     LIMIT 3`,
    [userId, userId, userId]
  );
  res.send(await getPostsWithUser(rows));
});

export const suggestTopics = asyncHandler(async (req, res, next) => {
  const { userId, limit } = req.query;
  let max = 7;
  if (limit === "no-limit") max = 9999;
  else if (typeof limit === "string" && parseInt(limit) > 0)
    max = Math.min(parseInt(limit), 9999);
  // topics the person already follows are not suggested again
  const skipFollowed = isId(userId);
  const tags = await query<{ id: string; name: string }>(
    `SELECT id, name FROM tags
     ${
       skipFollowed
         ? "WHERE name NOT IN (SELECT topic FROM user_interests WHERE user_id = ?)"
         : ""
     }
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    skipFollowed ? [userId, max] : [max]
  );
  res.send(tags.map((tag) => ({ _id: tag.id, name: tag.name })));
});

// pagination todo
export const getPostOfTopic = asyncHandler(async (req, res, next) => {
  const { topic } = req.params;
  if (topic === "Following") {
    if (!req.userId) {
      res.send([]);
      return;
    }
    const rows = await query<PostRow>(
      `SELECT p.* FROM posts p
       WHERE p.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?)
       ORDER BY p.created_at DESC, p.id DESC`,
      [req.userId]
    );
    res.send(await getPostsWithUser(rows));
    return;
  }
  const rows = await query<PostRow>(
    `SELECT p.* FROM posts p
     WHERE EXISTS (SELECT 1 FROM post_tags t WHERE t.post_id = p.id AND t.tag = ?)
     ORDER BY p.created_at DESC, p.id DESC`,
    [topic]
  );
  res.send(await getPostsWithUser(rows));
});

export const ignorePost = asyncHandler(async function (req, res, next) {
  const { userId } = req;
  const { postId } = req.params;
  const added = await exec(
    "INSERT IGNORE INTO ignored_posts (user_id, post_id) VALUES (?, ?)",
    [userId, postId]
  );
  res.send({ success: added.affectedRows == 1 });
});

export const vote = asyncHandler(async (req, res, next) => {
  const { postId } = req.params;
  const { userId } = req;
  const post = await queryOne<{ user_id: string; title: string }>(
    "SELECT user_id, title FROM posts WHERE id = ?",
    [postId]
  );
  if (!post) {
    res.send({ success: false });
    return;
  }
  const now = new Date();
  await exec(
    "INSERT INTO post_votes (id, post_id, user_id, created_at) VALUES (?, ?, ?, ?)",
    [newId(), postId, userId, now]
  );
  if (post.user_id !== userId) {
    const me = await queryOne<{ name: string; avatar: string | null }>(
      "SELECT name, avatar FROM users WHERE id = ?",
      [userId]
    );
    await exec(
      `INSERT INTO notifications
         (id, user_id, actor_id, username, avatar, message, post_id, post_title, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        newId(),
        post.user_id,
        userId,
        me?.name ?? "Someone",
        me?.avatar ?? null,
        "clapped for",
        postId,
        post.title,
        now,
      ]
    );
  }
  res.send({ success: true });
});

export const comment = asyncHandler(async (req, res, next) => {
  const { postId } = req.params;
  const { userId } = req;
  const { comment } = req.body ?? {};
  if (typeof comment !== "string" || !comment.trim())
    throw new ServerError(400, "Comment cannot be empty");
  const post = await queryOne("SELECT id FROM posts WHERE id = ?", [postId]);
  if (!post) {
    res.send({ success: false });
    return;
  }
  await exec(
    "INSERT INTO post_comments (id, post_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
    [newId(), postId, userId, comment, new Date()]
  );
  res.send({ success: true });
});

export const morefrom = asyncHandler(async (req, res, next) => {
  const { userId, postId } = req.params;
  const rows = await query<PostRow>(
    "SELECT * FROM posts WHERE user_id = ? AND id <> ? ORDER BY created_at, id LIMIT 3",
    [userId, postId]
  );
  res.send(await loadPosts(rows));
});

// todo pagination
export const explorePost = asyncHandler(async (req, res, next) => {
  const rows = await query<PostRow>(
    "SELECT * FROM posts ORDER BY created_at DESC, id DESC"
  );
  res.send(await getPostsWithUser(rows));
});

export const ignoreAuthor = asyncHandler(async (req, res, next) => {
  const { userId } = req;
  const { userId: authorId } = req.params;
  const added = await exec(
    "INSERT IGNORE INTO muted_authors (user_id, author_id) VALUES (?, ?)",
    [userId, authorId]
  );
  res.send({ success: added.affectedRows == 1 });
});

//todo pagination
export const getAllComments = asyncHandler(async (req, res, next) => {
  const { postId } = req.params;
  if (!postId) throw new ServerError(400, "Post Id is not provided");
  const post = await queryOne("SELECT id FROM posts WHERE id = ?", [postId]);
  if (!post) throw new ServerError(400, "Post does not exist");
  const comments = await query<{ user_id: string; body: string }>(
    "SELECT user_id, body FROM post_comments WHERE post_id = ? ORDER BY created_at, id",
    [postId]
  );
  const authorIds = Array.from(new Set(comments.map((item) => item.user_id)));
  const users = await loadUsers(await findUserRows(authorIds));
  const byId = new Map<string, any>();
  users.forEach((user) => byId.set(user._id, user));
  res.send(
    comments
      .map((item) => ({ comment: item.body, user: byId.get(item.user_id) }))
      .filter((item) => item.user)
  );
});

export const savePost = asyncHandler(async (req, res, next) => {
  const { userId } = req;
  const { listName = "Reading list" } = req.body ?? {};
  const { postId } = req.params;
  if (typeof listName !== "string" || !listName.trim() || listName.length > 100)
    throw new ServerError(400, "Invalid list name");
  const post = await queryOne<{ image: string | null }>(
    "SELECT image FROM posts WHERE id = ?",
    [postId]
  );
  if (!post) throw new ServerError(400, "Post does not exist");
  const now = new Date();
  // creates the list the first time, does nothing if it already exists
  await exec(
    "INSERT IGNORE INTO user_lists (id, user_id, name, created_at) VALUES (?, ?, ?, ?)",
    [newId(), userId, listName, now]
  );
  const list = await queryOne<{ id: string }>(
    "SELECT id FROM user_lists WHERE user_id = ? AND name = ?",
    [userId, listName]
  );
  if (!list) {
    res.send({ success: false });
    return;
  }
  // saving the same post twice is ignored (success: false)
  const added = await exec(
    "INSERT IGNORE INTO list_posts (list_id, post_id, image, created_at) VALUES (?, ?, ?, ?)",
    [list.id, postId, post.image, now]
  );
  res.send({ success: added.affectedRows == 1 });
});

export const unSavePost = asyncHandler(async (req, res, next) => {
  const { userId } = req;
  const { listName } = req.body ?? {};
  const { postId } = req.params;
  if (typeof listName !== "string" || !listName)
    throw new ServerError(400, "listName not provided");
  const post = await queryOne("SELECT id FROM posts WHERE id = ?", [postId]);
  if (!post) throw new ServerError(400, "Post does not exist");
  const removed = await exec(
    `DELETE FROM list_posts
     WHERE post_id = ?
       AND list_id IN (SELECT id FROM user_lists WHERE user_id = ? AND name = ?)`,
    [postId, userId, listName]
  );
  res.send({ success: removed.affectedRows == 1 });
});

// delete list -todo

//todo pagination
export const getAllSavedFromList = asyncHandler(async (req, res, next) => {
  const { listName } = req.params;
  if (!listName) throw new ServerError(400, "listName not provided");
  const user = await queryOne<UserRow>("SELECT id FROM users WHERE id = ?", [
    req.userId,
  ]);
  if (!user) throw new ServerError(400, "User does not exist");
  const list = await queryOne<{ id: string; name: string }>(
    "SELECT id, name FROM user_lists WHERE user_id = ? AND name = ?",
    [req.userId, listName]
  );
  if (!list) throw new ServerError(400, "List does not exist");
  const rows = await query<PostRow>(
    `SELECT p.* FROM list_posts lp
     JOIN posts p ON p.id = lp.post_id
     WHERE lp.list_id = ?
     ORDER BY lp.created_at, lp.post_id`,
    [list.id]
  );
  res.send({ name: list.name, posts: await getPostsWithUser(rows) });
});

// attaches the author to every post; posts whose author is gone are dropped
export async function attachUsers(posts: any[]) {
  const authorIds = Array.from(new Set(posts.map((post: any) => String(post.userId))));
  const users = await loadUsers(await findUserRows(authorIds));
  const byId = new Map<string, any>();
  users.forEach((user) => byId.set(user._id, user));
  return posts
    .map((post: any) => ({ post, user: byId.get(String(post.userId)) }))
    .filter((item) => item.user);
}

// post rows (already in the right order) -> [{ post, user }]
export async function getPostsWithUser(rows: PostRow[]) {
  return attachUsers(await loadPosts(rows));
}
