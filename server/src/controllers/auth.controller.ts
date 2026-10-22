import asyncHandler from "express-async-handler";
import axios from "axios";
import jwt from "jsonwebtoken";
import qs from "qs";
import { createHash } from "crypto";
import env from "../utils/envalid";
import { exec, newId, queryOne } from "../db";
import { UserRow } from "../utils/loaders";
import { JWTPayload } from "../middlewares/auth";
import ServerError from "../utils/ServerError";

// refresh tokens are stored as a SHA-256 fingerprint, not as the token itself
const fingerprint = (token: string) =>
  createHash("sha256").update(token).digest("hex");

//todo
export const emailLogin = asyncHandler((req, res, next) => {});

export const tokenRefresh = asyncHandler(async (req, res, next) => {
  const { token } = req.body ?? {};
  if (!token || typeof token !== "string")
    throw new ServerError(400, "Refresh token is required");
  let decoded: JWTPayload;
  try {
    decoded = <JWTPayload>jwt.verify(token, env.JWT_REFRESH_SECRET);
  } catch {
    throw new ServerError(401, "Invalid refresh token");
  }
  const stored = await queryOne("SELECT id FROM tokens WHERE token_hash = ?", [
    fingerprint(token),
  ]);
  if (!stored) throw new ServerError(401, "Refresh token has been revoked");
  const access_token = jwt.sign({ _id: decoded._id }, env.JWT_SECRET, {
    expiresIn: "30m",
  });
  res.json({ access_token });
});

export const logout = asyncHandler(async (req, res, next) => {
  const { refresh_token } = req.body ?? {};
  if (typeof refresh_token === "string" && refresh_token) {
    await exec("DELETE FROM tokens WHERE token_hash = ?", [
      fingerprint(refresh_token),
    ]);
  }
  res.json({ message: "logged out succesfully" });
});

export const googleAuth = asyncHandler(async (req, res, next) => {
  if (req.query.error) return res.redirect(`${env.CLIENT_URL}/signin/in`);
  const code = req.query.code;
  if (typeof code !== "string" || !code)
    throw new ServerError(400, "Missing Google authorization code");
  const googleTokens = await getUserFromCode(code);
  if (!googleTokens?.access_token)
    throw new ServerError(401, "Google sign in failed, please try again");
  const { id_token, access_token } = googleTokens;
  const user = await userDetails(access_token, id_token);
  if (!user?.email)
    throw new ServerError(401, "Could not read your Google profile");

  // first sign in creates the account (and the default "Reading list")
  const now = new Date();
  const created = await exec(
    `INSERT IGNORE INTO users (id, email, name, avatar, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      user.email,
      String(user.name ?? user.email.split("@")[0]).slice(0, 255),
      user.picture ??
        "https://firebasestorage.googleapis.com/v0/b/upload-pics-e599e.appspot.com/o/images%2F1_dmbNkD5D-u45r44go_cf0g.png?alt=media&token=3ef51503-f601-448b-a55b-0682607ddc8a",
      now,
      now,
    ]
  );
  const account = await queryOne<UserRow>("SELECT * FROM users WHERE email = ?", [
    user.email,
  ]);
  if (!account)
    throw new ServerError(500, "Could not create your account, please try again");
  if (created.affectedRows == 1) {
    await exec(
      "INSERT IGNORE INTO user_lists (id, user_id, name, created_at) VALUES (?, ?, ?, ?)",
      [newId(), account.id, "Reading list", now]
    );
  }

  const access_token_server = jwt.sign({ _id: account.id }, env.JWT_SECRET, {
    expiresIn: "30m",
  });
  const refresh_token_server = jwt.sign(
    { _id: account.id },
    env.JWT_REFRESH_SECRET
  );
  await exec(
    "INSERT INTO tokens (id, user_id, token_hash, created_at) VALUES (?, ?, ?, ?)",
    [newId(), account.id, fingerprint(refresh_token_server), now]
  );
  res.redirect(
    `${env.CLIENT_URL}/oauth/redirect?uid=${account.id}&access_token=${access_token_server}&refresh_token=${refresh_token_server}`
  );
});

async function getUserFromCode(code: string) {
  const url = "https://oauth2.googleapis.com/token";
  const values = {
    code,
    client_id: env.clientid,
    client_secret: env.clientsecret,
    redirect_uri: env.redirect_url,
    grant_type: "authorization_code",
  };

  try {
    const res = await axios.post(url, qs.stringify(values), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    return res.data;
  } catch (error) {
    console.error(error);
  }
}

async function userDetails(access_token: string, id_token: string) {
  return axios
    .get(
      `https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${access_token}`,
      {
        headers: {
          Authorization: `Bearer ${id_token}`,
        },
      }
    )
    .then((res) => res.data)
    .catch((error) => {
      console.error(`Failed to fetch user`);
    });
}
