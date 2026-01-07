export const config = { runtime: "nodejs" };

function clearCookie(res, sameSite, secure) {
  const parts = [
    "token=",
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    `SameSite=${sameSite}`
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export default async function handler(req, res) {
  // Wichtig: Cookie muss mit denselben Attributen gelöscht werden, mit denen er gesetzt wurde.
  // Wir setzen mehrere Varianten als Fallback (None/Secure für Vercel, plus Lax-Varianten).
  res.setHeader("Set-Cookie", [
    clearCookie(res, "None", true),
    clearCookie(res, "Lax", true),
    clearCookie(res, "Lax", false)
  ]);

  return res.status(200).json({ ok: true });
}