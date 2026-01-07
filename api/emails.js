import { kv } from "@vercel/kv";
import { jwtVerify } from "jose";

function getCookie(req, name) {
  const cookie = req.headers.cookie || "";
  const parts = cookie.split(";").map(p => p.trim());
  const found = parts.find(p => p.startsWith(name + "="));
  return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : "";
}

async function getUsernameFromToken(req) {
  const token = getCookie(req, "token");
  if (!token) return null;

  const secretValue = process.env.JWT_SECRET;
  if (!secretValue) throw new Error("JWT_SECRET fehlt");

  const secret = new TextEncoder().encode(secretValue);
  const { payload } = await jwtVerify(token, secret);
  return payload?.username ? String(payload.username) : null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  try {
    const username = await getUsernameFromToken(req);
    if (!username) return res.status(401).send("Nicht eingeloggt.");

    const key = `emails:${username}`;

    // hole alle (max 200, weil wir ltrim auf 200 machen)
    const raw = await kv.lrange(key, 0, -1);

    const emails = (raw || []).map(v => {
      try { return JSON.parse(v); } catch { return { email: String(v) }; }
    });

    return res.status(200).json({ ok: true, emails });
  } catch (err) {
    return res.status(500).send("Serverfehler.");
  }
}