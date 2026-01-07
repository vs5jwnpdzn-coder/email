export const config = { runtime: "nodejs" };

function clearCookie(sameSite, secure) {
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
  res.setHeader("Set-Cookie", [
    clearCookie("None", true),
    clearCookie("Lax", true),
    clearCookie("Lax", false)
  ]);

  return res.status(200).json({ ok: true });
}s