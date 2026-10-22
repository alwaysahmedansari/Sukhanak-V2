import { NextFunction, Request, Response } from "express";
import ServerError from "../utils/ServerError";
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err.message == "jwt expired")
    return res.status(401).send({ message: "UnAuthorized, JWT Expired" });
  if (err.name === "JsonWebTokenError")
    return res.status(401).send({ message: "Unauthorised, invalid token" });
  if (err instanceof ServerError)
    return res.status(err.statusCode).send({ message: err.message });
  const dbError = err as Error & { code?: string; sqlMessage?: string };
  if (dbError.code === "ER_DATA_TOO_LONG")
    return res.status(400).send({ message: "One of the values is too long" });
  if (dbError.sqlMessage || dbError.code?.startsWith("ER_")) {
    // do not show database details to visitors, only in the server log
    console.error(err);
    return res.status(500).send({ message: "Database error" });
  }
  console.error(err);
  res.status(500).send({ message: err.message ?? "Internal Server Error" });
};
