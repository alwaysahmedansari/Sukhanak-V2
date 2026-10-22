# Sukhanak - full stack blogging platform

Sukhanak is a blogging website where people can write stories, follow writers,
save posts to reading lists, clap, comment and get notifications.
It is built with React, Node, Express, TypeScript and TiDB Cloud (a MySQL-compatible database).

## What you need

- Node.js 18 or newer - [download](https://nodejs.org/en/download/)
- A free [TiDB Cloud](https://tidbcloud.com/) account (the database - see "Database" below)

## Database (TiDB Cloud)

TiDB Cloud only hosts the **database**. The Node/Express server in `server/` still has to run
somewhere else (your computer, Render, etc. - see "Deploying").

1. Sign up at [tidbcloud.com](https://tidbcloud.com/) and create a **Starter** instance
   (it has a free monthly quota and the free quota does not need a credit card).
2. Open the instance and click **Connect**. Copy the **host**, **port**, **user** and **password**
   (create a password there if it asks).
3. Put them in `server/.env` as `TIDB_HOST`, `TIDB_PORT`, `TIDB_USER`, `TIDB_PASSWORD`.
4. Create the tables once (step 1 below, `npm run db:setup`).

The free quota is per month (5 GiB storage and 50 million "request units" at the time of writing -
check the TiDB Cloud pricing page for the current numbers). When a free instance uses it all up, it
is slowed down or refuses new connections until the next month, unless you set a monthly spending
limit in TiDB Cloud. Keep an eye on the usage page as the site grows.

## 1. Server setup

```bash
cd server
cp .env.example .env     # then open .env and fill in your values
npm install
npm run db:setup         # creates the tables in your TiDB Cloud database (run once)
npm run dev
```

The server starts on port 8000. Open `http://localhost:8000/test` - you should see
"Hello from server side".

| Variable | What to put |
| --- | --- |
| `TIDB_HOST`, `TIDB_PORT`, `TIDB_USER`, `TIDB_PASSWORD` | Connection values from TiDB Cloud ("Connect" button) |
| `TIDB_DATABASE` | Database name. Default `sukhanak` (created by `npm run db:setup`) |
| `TIDB_SSL` | Keep `true` for TiDB Cloud. `false` only for a local MySQL without TLS |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Two different long random texts |
| `CLIENT_URL` | Address of the website, e.g. `http://localhost:5173` |
| `clientid`, `clientsecret`, `redirect_url` | Google sign-in values (see below) |
| `PORT`, `DEV` | Optional. Default `8000` and `true` |

If `npm run db:setup` cannot create the database, create an empty one in TiDB Cloud (or use the
existing `test` database and set `TIDB_DATABASE=test`) and run it again. The table definitions are in
`server/schema.sql`; you can also paste that file into the TiDB Cloud SQL Editor.

## 2. Client (website) setup

```bash
cd client
cp .env.example .env     # then open .env and fill in your values
npm install
npm run dev
```

Open `http://localhost:5173`.

## Google sign-in

Sign-in works with a Google account, so you need your own (free) Google credentials:

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project.
2. Open **APIs & Services -> OAuth consent screen** and set it up (External).
3. Open **Credentials -> Create credentials -> OAuth client ID -> Web application**.
4. Under **Authorized redirect URIs** add the same address you use for `redirect_url`,
   for example `http://localhost:8000/auth/google/oauth`.
5. Copy the **Client ID** into `VITE_GOOGLE_CLIENT_ID` (client `.env`) and `clientid` (server `.env`).
   Copy the **Client secret** into `clientsecret` (server `.env`).

The redirect address must be exactly the same in three places: Google Console,
`redirect_url` (server) and `VITE_GOOGLE_OAUTH_REDIRECT_URL` (client).

## Running in GitHub Codespaces (or on a phone)

`localhost` does not work there, because your browser is not on the same machine as the code.
In the **Ports** tab, make ports `8000` and `5173` **Public**, then use their forwarded
addresses (they look like `https://NAME-8000.app.github.dev`) instead of `localhost`:

- server `.env`: `CLIENT_URL` = the 5173 address, `redirect_url` = the 8000 address + `/auth/google/oauth`
- client `.env`: `VITE_API_URL` = the 8000 address, `VITE_GOOGLE_OAUTH_REDIRECT_URL` = same as `redirect_url`
- add the same redirect address in Google Console

Restart both `npm run dev` commands after changing any `.env` file.

## Deploying

- Client: Vercel (a `vercel.json` is included). Set the same `VITE_...` variables in the Vercel dashboard.
- Server: any Node host (for example Render). Build with `npm run build`, start with `npm start`,
  and set the server variables (including the `TIDB_*` ones) in the host's dashboard.
- Database: TiDB Cloud (run `npm run db:setup` once, from any computer that has the `.env` values).

Never upload your real `.env` files to a public repository.
