import { cleanEnv } from "envalid";
import { port, str, bool } from "envalid/dist/validators";

const env = cleanEnv(process.env, {
  PORT: port({ default: 8000 }),
  // TiDB Cloud database (see README, "Database")
  TIDB_HOST: str(),
  TIDB_PORT: port({ default: 4000 }),
  TIDB_USER: str(),
  TIDB_PASSWORD: str({ default: "" }),
  TIDB_DATABASE: str({ default: "sukhanak" }),
  TIDB_SSL: bool({ default: true }),
  JWT_SECRET: str(),
  JWT_REFRESH_SECRET: str(),
  DEV: bool({ default: true }),
  CLIENT_URL: str({ default: "http://localhost:5173" }),
  email: str({ default: "" }),
  password: str({ default: "" }),
  clientid: str({ default: "" }),
  clientsecret: str({ default: "" }),
  redirect_url: str({
    default: "http://localhost:8000/auth/google/oauth",
  }),
});

export default env;
