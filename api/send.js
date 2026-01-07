export const config = { runtime: "nodejs" };

import { kv } from "@vercel/kv";
import { jwtVerify } from "jose";
import { json } from "micro";   // 🔴 DAS ist der Fix

function getCookie(req, name) {
  const cookie = req.headers.cookie || "";
  const parts = cookie.split(";").map(p => p.trim());
  const found = parts.find(p => p.startsWith(name + "="));
  return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : "";
}

async function getUsername(req) {
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
    const username = await getUsername(req);
    if (!username) {
      return res.status(401).send("Nicht eingeloggt");
    }

    // ✅ EINZIG STABILER BODY-PARSER AUF VERCEL
    const body = await json(req);

    if (typeof body.email !== "string") {
      return res.status(400).send("Email fehlt");
    }

    const email = body.email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(400).send("Ungültige Email");
    }

    const key = `emails:${username}`;

    await kv.lpush(
      key,
      JSON.stringify({ email, ts: Date.now() })
    );

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error("SEND ERROR:", err);
    return res.status(500).send("Serverfehler: " + err.message);
  }
}