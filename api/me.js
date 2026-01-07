import { jwtVerify } from "jose";

// Cookie aus dem Request lesen
function getCookie(req, name) {
  const cookie = req.headers.cookie || "";
  const parts = cookie.split(";").map(p => p.trim());
  const found = parts.find(p => p.startsWith(name + "="));
  return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : "";
}

export default async function handler(req, res) {
  const token = getCookie(req, "token");

  // ❌ Nicht eingeloggt
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

    // ✅ Eingeloggt
    return res.status(200).json({
      ok: true,
      username: payload.username
    });

  } catch (err) {
    // ❌ Token ungültig / abgelaufen
    return res.status(401).json({ ok: false });
  }
}