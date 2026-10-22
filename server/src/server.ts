import { config } from "dotenv";
config();
import { server } from "./app";
import env from "./utils/envalid";
import { pool } from "./db";

pool
  .query("SELECT 1")
  .then(() => server.listen(env.PORT))
  .then(() => console.log("Server running at PORT :", env.PORT))
  .catch((err) => {
    console.error("Could not connect to the TiDB database:", err.message);
    console.error("Check the TIDB_* values in your .env file.");
    process.exit(1);
  });
