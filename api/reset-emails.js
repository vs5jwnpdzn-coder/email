export const config = { runtime: "nodejs" };

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

  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const { payload } = await jwtVerify(token, secret);
  return String(payload.username);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    const username = await getUsernameFromToken(req);
    if (!username) {
      return res.status(401).send("Nicht eingeloggt.");
    }

    const key = `emails:${username}`;

    // ✅ ALLE Emails dieses Users löschen
    await kv.del(key);

    return res.status(200).json({
      ok: true,
      message: "Alle Emails wurden gelöscht."
    });
  } catch (err) {
    return res.status(500).send("Serverfehler: " + err.message);
  }
}