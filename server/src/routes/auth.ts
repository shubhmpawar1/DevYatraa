import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { one } from "../db.js";
import { ah, HttpError, requireAuth, signToken } from "../http.js";

export const authRouter = Router();

const Register = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

authRouter.post("/register", ah(async (req, res) => {
  const body = Register.parse(req.body);
  // ALLOWED_EMAILS (comma-separated) limits who can sign up. Empty = anyone (local dev).
  const allowed = (process.env.ALLOWED_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(body.email)) {
    throw new HttpError(403, "Sign-up is closed on this site.");
  }
  const exists = await one("SELECT id FROM users WHERE email = $1", [body.email]);
  if (exists) throw new HttpError(409, "An account with this email already exists. Log in instead.");
  const hash = await bcrypt.hash(body.password, 10);
  const user = await one<{ id: number }>(
    "INSERT INTO users (email, name, password_hash) VALUES ($1,$2,$3) RETURNING id",
    [body.email, body.name, hash],
  );
  res.json({ token: signToken(user!.id) });
}));

const Login = z.object({ email: z.string().trim().toLowerCase(), password: z.string() });

authRouter.post("/login", ah(async (req, res) => {
  const body = Login.parse(req.body);
  const user = await one<{ id: number; password_hash: string }>("SELECT id, password_hash FROM users WHERE email = $1", [body.email]);
  if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
    throw new HttpError(401, "Email or password is wrong.");
  }
  res.json({ token: signToken(user.id) });
}));

authRouter.get("/me", requireAuth, ah(async (req, res) => {
  const user = await one("SELECT id, email, name FROM users WHERE id = $1", [req.userId]);
  if (!user) throw new HttpError(401, "Please log in again.");
  const profile = await one("SELECT user_id FROM profiles WHERE user_id = $1", [req.userId]);
  res.json({ ...user, onboarded: Boolean(profile) });
}));
