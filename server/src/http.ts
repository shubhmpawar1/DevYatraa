import type { NextFunction, Request, Response, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

export interface AuthedRequest extends Request {
  userId: number;
}

export function jwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error("JWT_SECRET must be set in server/.env (at least 16 characters).");
  return s;
}

export function signToken(userId: number): string {
  return jwt.sign({ sub: String(userId) }, jwtSecret(), { expiresIn: "30d" });
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  try {
    const payload = jwt.verify(token, jwtSecret()) as jwt.JwtPayload;
    (req as AuthedRequest).userId = Number(payload.sub);
    next();
  } catch {
    next(new HttpError(401, "Please log in again."));
  }
};

/** Wraps an async handler so thrown errors reach the error middleware. */
export function ah(fn: (req: AuthedRequest, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req as AuthedRequest, res).catch(next);
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...err.extra });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Some fields are missing or invalid.", issues: err.issues });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
}
