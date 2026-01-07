import { jwtVerify } from "jose";

function getCookie(req, name) {
  const cookie = req.headers.cookie || "";
  const parts = cookie.split(";").map(p => p.trim());
  const found = parts.find(p => p.startsWith(name + "="));
  return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : "";
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false });
  }

  const token = getCookie(req, "token");
  if (!token) {
    return res.status(401).json({ ok: false });
  }

  try {
    const secretValue = process.env.JWT_SECRET;
    if (!secretValue) {
      return res.status(500).json({ ok: false, error: "JWT_SECRET fehlt" });
    }

    const secret = new TextEncoder().encode(secretValue);
    const { payload } = await jwtVerify(token, secret);

    return res.status(200).json({ ok: true, username: payload.username });
  } catch {
    return res.status(401).json({ ok: false });
  }
}