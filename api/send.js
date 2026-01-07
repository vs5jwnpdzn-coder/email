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

  const secretValue = process.env.JWT_SECRET;
  if (!secretValue) throw new Error("JWT_SECRET fehlt");

  const secret = new TextEncoder().encode(secretValue);
  const { payload } = await jwtVerify(token, secret);
  return payload?.username ? String(payload.username) : null;
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;

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

    const body = await readJson(req);
    const email = String(body.email || "").trim();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) return res.status(400).send("Bitte eine Email eingeben.");
    if (!emailRegex.test(email)) return res.status(400).send("Ungültige Email.");

    // WICHTIG: pro User eigener Key
    const key = `emails:${username}`;

    // Speichern (neueste zuerst), max 200 Einträge
    await kv.lpush(key, JSON.stringify({ email, ts: Date.now() }));
    await kv.ltrim(key, 0, 199);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("SEND ERROR:", err);
    // ✅ echte Fehlermeldung an dich zurückgeben
    return res
      .status(500)
      .send("Serverfehler (send): " + (err?.message || String(err)));
  }
}