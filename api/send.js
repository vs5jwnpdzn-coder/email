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

async function getBody(req) {
  // Wenn Vercel schon geparst hat
  if (req.body && typeof req.body === "object") return req.body;

  // Raw lesen
  let raw = "";
  await new Promise((resolve, reject) => {
    req.on("data", chunk => (raw += chunk));
    req.on("end", resolve);
    req.on("error", reject);
  });

  if (!raw) return {};
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  try {
    const username = await getUsernameFromToken(req);
    if (!username) return res.status(401).send("Nicht eingeloggt.");

    const body = await getBody(req);

    // ✅ NUR String akzeptieren (sonst kommt [object Object])
    if (typeof body.email !== "string") {
      return res.status(400).send("Ungültige Email (kein Text).");
    }

    const email = body.email.trim();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).send("Ungültige Email.");
    }

    const key = `emails:${username}`;

    await kv.lpush(key, JSON.stringify({ email, ts: Date.now() }));
    await kv.ltrim(key, 0, 199);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("SEND ERROR:", err);
    return res.status(500).send("Serverfehler: " + (err?.message || String(err)));
  }
}