# Changes made (TiDB Cloud + cleanup)

## Database: MongoDB -> TiDB Cloud
- The server now stores everything in TiDB Cloud (MySQL-compatible SQL) instead of MongoDB/Mongoose.
- New: `server/schema.sql` (all tables), `server/src/db.ts` (connection + helpers),
  `server/src/utils/loaders.ts` (builds the same JSON the website already reads),
  `server/src/scripts/setup-db.ts` (`npm run db:setup` creates the tables).
- Removed: `server/src/models/` (Mongoose) and the `mongoose` package. Added the `mysql2` package.
- Rewritten for SQL: all four controllers, the notification sockets in `app.ts`, `server.ts`,
  `envalid.ts`, `helpers.ts`, `errorHandler.ts`, `.env.example`, README.
- The website (`client/`) and the `routers/` are unchanged: the API and the JSON shape are the same
  (`_id`, `votes`, `followers`, `lists`, ...).
- `MONGO_URI` is replaced by `TIDB_HOST`, `TIDB_PORT`, `TIDB_USER`, `TIDB_PASSWORD`, `TIDB_DATABASE`, `TIDB_SSL`.
- Small differences from the old behaviour:
  - Ids are UUID text instead of MongoDB ObjectIds (starting fresh, so no old data is affected).
  - Refresh tokens are stored as a SHA-256 fingerprint, not as the token itself.
  - "Edit profile" answers `success: true` whenever the profile was saved (before: `false` if nothing had changed).
  - Deleting an account now also removes the person's claps, comments, follows, saved lists, notifications and login tokens;
    deleting a post also removes its claps, comments, tags and saved-list entries.
  - Too-long values (title over 1000, tag/topic/list name over 100 characters) give a clear 400 error.
  - Database errors are not shown to visitors (only in the server log).
- After unzipping, run `npm install` once inside `server/` so `package-lock.json` is refreshed for `mysql2`.

## Cleanup
- Removed the `screenshots/` folder (old screenshots of the Medium-style layout, not used by any file).

## Not changed (still to do)
- Pagination: lists such as Explore and the home feed still load everything. Adding pagination will
  also keep database usage (and cost) low as the site grows.

# Earlier changes (rename to Sukhanak + code review)

## Rename
- Every visible "Medium" is now "Sukhanak" (page titles, search box, sign-in text, share text, menus).
- New logo, favicon and home-page pattern (the old ones were Medium's own artwork).
- Logo component renamed `mediumLogo` -> `sukhanakLogo`; package names and README updated.

## Fixes (server)
- Search no longer crashes on characters like `(` or `c++` (input is escaped).
- Private data (email, notifications, saved lists, muted lists) is no longer sent to other people
  in feeds, search, followers and comments. The email is only returned to its owner.
- Profile edit only accepts name / bio / avatar (before: any field, even followers).
- Post write/edit only accept title / markdown / tags; edit now also refreshes the summary and cover image.
- Missing title/content/tags gives a clear 400 error instead of a crash; tags are trimmed and de-duplicated.
- "Top Picks" is now really sorted by number of claps.
- "Following" tab is now sorted newest first (the old sort did nothing).
- Saved list no longer returns a random user when a saved post was deleted; saving the same post twice is ignored.
- Refresh tokens must still exist in the database, so logout really logs out; logout never fails twice.
- Google sign-in shows clear errors (and handles "cancel") instead of crashing.
- Invalid token -> 401, invalid id -> 400 (before: 500).
- Typo `require: true` -> `required: true` in the post model.
- Can't follow yourself; no clap notification to yourself; no duplicate interests / ignored posts.
- Fewer database queries (followers, comments and feed authors are loaded in one query).
- `.env` now has defaults (port, client url, Google values, unused email/password), so the server starts easily.
- Removed a log line that printed refresh tokens.

## Fixes (client)
- Notification badge now starts right after login (not only after a page reload).
- Login redirect checked a field that never existed; it now checks the user id and sends the token.
- No crash on network errors in the request interceptor.
- Removed leftover debug `console.log` lines.
- Favicon type fixed (png). Someone else's Google Client ID removed from `client/.env`.

## Not changed (ideas for later)
- Pagination (several `todo` notes in the code), email login, "delete list".
