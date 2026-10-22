import { query } from "../db";

/*
 * The website expects the same JSON the old MongoDB server sent
 * (_id, votes: [...], followers: [...], lists: [...] and so on).
 * These helpers read the SQL tables and build exactly that shape,
 * so the client code does not need any change.
 */

export interface UserRow {
  id: string;
  email: string;
  name: string;
  bio: string | null;
  avatar: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PostRow {
  id: string;
  user_id: string;
  title: string;
  markdown: string;
  image: string | null;
  summary: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  actor_id: string | null;
  username: string;
  avatar: string | null;
  message: string;
  post_id: string | null;
  post_title: string | null;
  is_read: number;
  created_at: Date;
}

function group<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return map;
}

/** Loads users by id (order is not guaranteed). */
export async function findUserRows(ids: string[]): Promise<UserRow[]> {
  if (!ids.length) return [];
  return query<UserRow>("SELECT * FROM users WHERE id IN (?)", [ids]);
}

/** Post rows -> posts with tags, votes and comments, like before. */
export async function loadPosts(rows: PostRow[]): Promise<any[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [tags, votes, comments] = await Promise.all([
    query<{ post_id: string; tag: string }>(
      "SELECT post_id, tag FROM post_tags WHERE post_id IN (?) ORDER BY sort_order",
      [ids]
    ),
    query<{ post_id: string; user_id: string }>(
      "SELECT post_id, user_id FROM post_votes WHERE post_id IN (?) ORDER BY created_at, id",
      [ids]
    ),
    query<{ id: string; post_id: string; user_id: string; body: string }>(
      "SELECT id, post_id, user_id, body FROM post_comments WHERE post_id IN (?) ORDER BY created_at, id",
      [ids]
    ),
  ]);
  const tagsByPost = group(tags, (item) => item.post_id);
  const votesByPost = group(votes, (item) => item.post_id);
  const commentsByPost = group(comments, (item) => item.post_id);
  return rows.map((row) => ({
    _id: row.id,
    title: row.title,
    markdown: row.markdown,
    userId: row.user_id,
    tags: (tagsByPost.get(row.id) ?? []).map((item) => item.tag),
    votes: (votesByPost.get(row.id) ?? []).map((item) => item.user_id),
    comments: (commentsByPost.get(row.id) ?? []).map((item) => ({
      _id: item.id,
      userId: item.user_id,
      comment: item.body,
    })),
    image: row.image ?? undefined,
    summary: row.summary ?? undefined,
    savedBy: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/** Saved lists of several users: Map(userId -> [{ _id, name, posts, images }]). */
export async function loadLists(userIds: string[]): Promise<Map<string, any[]>> {
  const result = new Map<string, any[]>();
  if (!userIds.length) return result;
  const lists = await query<{ id: string; user_id: string; name: string }>(
    "SELECT id, user_id, name FROM user_lists WHERE user_id IN (?) ORDER BY created_at, id",
    [userIds]
  );
  const items = lists.length
    ? await query<{ list_id: string; post_id: string; image: string | null }>(
        "SELECT list_id, post_id, image FROM list_posts WHERE list_id IN (?) ORDER BY created_at, post_id",
        [lists.map((list) => list.id)]
      )
    : [];
  const itemsByList = group(items, (item) => item.list_id);
  for (const list of lists) {
    const entries = itemsByList.get(list.id) ?? [];
    const shaped = {
      _id: list.id,
      name: list.name,
      posts: entries.map((entry) => entry.post_id),
      images: entries.map((entry) => entry.image),
    };
    const mine = result.get(list.user_id);
    if (mine) mine.push(shaped);
    else result.set(list.user_id, [shaped]);
  }
  return result;
}

/**
 * User rows -> users with followers, followings and interests.
 * The email and saved lists are added only when `owner` is true
 * (the person looking at their own profile).
 * Notifications, ignored posts and muted authors are never included.
 */
export async function loadUsers(
  rows: UserRow[],
  opts: { owner?: boolean } = {}
): Promise<any[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [followers, followings, interests, lists] = await Promise.all([
    query<{ uid: string; other: string }>(
      "SELECT following_id AS uid, follower_id AS other FROM follows WHERE following_id IN (?) ORDER BY created_at",
      [ids]
    ),
    query<{ uid: string; other: string }>(
      "SELECT follower_id AS uid, following_id AS other FROM follows WHERE follower_id IN (?) ORDER BY created_at",
      [ids]
    ),
    query<{ uid: string; topic: string }>(
      "SELECT user_id AS uid, topic FROM user_interests WHERE user_id IN (?) ORDER BY created_at",
      [ids]
    ),
    opts.owner ? loadLists(ids) : Promise.resolve(new Map<string, any[]>()),
  ]);
  const followersByUser = group(followers, (item) => item.uid);
  const followingsByUser = group(followings, (item) => item.uid);
  const interestsByUser = group(interests, (item) => item.uid);
  return rows.map((row) => {
    const user: any = {
      _id: row.id,
      name: row.name,
      bio: row.bio ?? undefined,
      avatar: row.avatar ?? undefined,
      followers: (followersByUser.get(row.id) ?? []).map((item) => item.other),
      followings: (followingsByUser.get(row.id) ?? []).map((item) => item.other),
      intrests: (interestsByUser.get(row.id) ?? []).map((item) => item.topic),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (opts.owner) {
      user.email = row.email;
      user.lists = lists.get(row.id) ?? [];
    }
    return user;
  });
}

/** One notification row -> the shape the notifications page reads. */
export function toNotification(row: NotificationRow) {
  return {
    _id: row.id,
    userId: row.actor_id ?? undefined,
    username: row.username,
    avatar: row.avatar ?? undefined,
    message: row.message,
    postId: row.post_id ?? undefined,
    postTitle: row.post_title ?? undefined,
    read: Boolean(row.is_read),
    createdAt: row.created_at,
  };
}
