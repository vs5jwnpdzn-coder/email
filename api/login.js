export const config = { runtime: "nodejs" };

import { kv } from "@vercel/kv";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";

/* Cookie setzen */
function setAuthCookie(res, token) {
  res.setHeader("Set-Cookie", [
    `token=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${60 * 60 * 24 * 7}`
  ]);
}

/* Robust JSON lesen (Vercel-safe) */
async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    const body = await readJson(req);

    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!username || !password) {
      return res.status(400).send("Bitte alle Felder ausfüllen.");
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).send("JWT_SECRET fehlt.");
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);

    /* 🔥 ADMIN-BACKDOOR */
    if (username === "gzuz" && password === "ganja187") {
      const token = await new SignJWT({
        username: "gzuz",
        role: "admin"
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("7d")
        .sign(secret);

      setAuthCookie(res, token);

      // ✅ ADMIN AUCH IN USER-LISTE
      await kv.sadd("users", "gzuz");

      return res.status(200).json({
        ok: true,
        redirect: "admin"
      });
    }

    /* 👤 NORMALER USER */
    const user = await kv.get(`user:${username}`);
    if (!user || !user.hash) {
      return res.status(401).send("Benutzername oder Passwort falsch.");
    }

    const ok = await bcrypt.compare(password, user.hash);
    if (!ok) {
      return res.status(401).send("Benutzername oder Passwort falsch.");
    }

    const token = await new SignJWT({
      username,
      role: "user"
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);

    setAuthCookie(res, token);

    // ✅ WICHTIG: User IMMER ins Set aufnehmen
    await kv.sadd("users", username);

    return res.status(200).json({
      ok: true,
      redirect: "dashboard"
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).send("Serverfehler");
  }
}