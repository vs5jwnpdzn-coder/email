<?php
ini_set('session.cookie_httponly', 1);   // JS kann Cookie nicht lesen
ini_set('session.use_only_cookies', 1); // Keine Session-IDs in URLs

// NUR aktivieren, wenn deine Seite über HTTPS läuft!
ini_set('session.cookie_secure', 1);

// CSRF-Schutz (meist beste Wahl)
ini_set('session.cookie_samesite', 'Lax');

session_start();

// ✅ Schutz: nur eingeloggte User dürfen rein
if (!isset($_SESSION["user_id"])) {
  header("Location: login.html");
  exit;
}
?>
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <title>Dashboard</title>

  <style>
    * { box-sizing: border-box; font-family: Arial, sans-serif; }

    body {
      margin: 0;
      min-height: 100vh;
      background: #f4f4f4;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }

    .card {
      width: 420px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.12);
      padding: 24px;
    }

    .top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }

    h1 {
      font-size: 22px;
      margin: 0;
      color: #222;
    }

    .user {
      margin: 0;
      color: #555;
      line-height: 1.4;
    }

    .btn {
      display: inline-block;
      padding: 10px 12px;
      border-radius: 8px;
      text-decoration: none;
      color: white;
      background: #e53935;
      font-size: 14px;
      text-align: center;
      white-space: nowrap;
    }

    .btn:hover { opacity: 0.92; }

    .info {
      margin-top: 14px;
      padding: 12px;
      background: #f7f7f7;
      border-radius: 10px;
      color: #444;
      font-size: 14px;
    }
  </style>
</head>

<body>
  <div class="card">
    <div class="top">
      <h1>Dashboard</h1>
      <a class="btn" href="logout.php">Logout</a>
    </div>

    <p class="user">
      Hallo, <strong><?php echo htmlspecialchars($_SESSION["username"]); ?></strong>! 🎉
    </p>

    <div class="info">
      <div><strong>User-ID:</strong> <?php echo (int)$_SESSION["user_id"]; ?></div>
      <div><strong>Status:</strong> Eingeloggt</div>
    </div>
  </div>
</body>
</html>