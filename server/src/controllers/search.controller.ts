import asyncHandler from "express-async-handler";
import { query } from "../db";
import { getPostsWithUser } from "./post.controller";
import { escapeLike, isId } from "../utils/helpers";
import { loadUsers, PostRow, UserRow } from "../utils/loaders";

// "React" -> "%react%" (searches are not case sensitive)
const likePattern = (text: string) => `%${escapeLike(text.toLowerCase())}%`;

//todo pagination
export const postSearch = asyncHandler(async (req, res, next) => {
  const { query: text } = req.params;
  const { userId } = req.body ?? {};
  let hide = "";
  const params: unknown[] = [likePattern(text)];
  if (isId(userId)) {
    hide = `
      AND NOT EXISTS (SELECT 1 FROM ignored_posts i WHERE i.user_id = ? AND i.post_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM muted_authors m WHERE m.user_id = ? AND m.author_id = p.user_id)`;
    params.push(userId, userId);
  }
  const rows = await query<PostRow>(
    `SELECT p.* FROM posts p
     WHERE LOWER(p.title) LIKE ? ${hide}
     ORDER BY p.created_at DESC, p.id DESC`,
    params
  );
  res.send(await getPostsWithUser(rows));
});

//todo pagination
export const topicSearch = asyncHandler(async (req, res, next) => {
  const { query: text } = req.params;
  const tags = await query<{ id: string; name: string }>(
    "SELECT id, name FROM tags WHERE LOWER(name) LIKE ? ORDER BY created_at, id",
    [likePattern(text)]
  );
  res.send(tags.map((tag) => ({ _id: tag.id, name: tag.name })));
});

//todo pagination
export const userSearch = asyncHandler(async (req, res, next) => {
  const { query: text } = req.params;
  const rows = await query<UserRow>(
    "SELECT * FROM users WHERE LOWER(name) LIKE ? ORDER BY created_at, id",
    [likePattern(text)]
  );
  res.send(await loadUsers(rows));
});
