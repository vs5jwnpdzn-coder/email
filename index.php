<?php
require __DIR__ . "/csrf.php";
csrf_init();

// Wenn schon eingeloggt -> Dashboard
if (isset($_SESSION["user_id"])) {
  header("Location: dashboard.php");
  exit;
}

$token = csrf_token();
?>
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Anmelden</title>
  <style>
    * { box-sizing: border-box; font-family: Arial, sans-serif; }
    body { height:100vh; margin:0; background:linear-gradient(135deg,#43cea2,#185a9d); display:flex; justify-content:center; align-items:center; }
    .container { background:#fff; padding:30px; width:340px; border-radius:10px; box-shadow:0 10px 25px rgba(0,0,0,.2); text-align:center; }
    h1 { margin-bottom:20px; }
    input { width:100%; padding:10px; margin:8px 0; font-size:14px; }
    button { width:100%; padding:10px; margin-top:15px; border:none; cursor:pointer; color:#fff; font-size:15px; border-radius:5px; background:#4CAF50; }
    .error{ background:#ffd6d6; border:1px solid #ff9b9b; padding:10px; margin-bottom:15px; font-size:14px; display:none; }
    .link{ margin-top:15px; font-size:14px; }
    .link a{ color:#2196F3; text-decoration:none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Anmelden</h1>
    <div id="errorBox" class="error"></div>

    <form action="login.php" method="POST">
      <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($token); ?>">
      <input type="text" name="username" placeholder="Benutzername" required>
      <input type="password" name="password" placeholder="Passwort" required>
      <button type="submit">Anmelden</button>
    </form>

    <div class="link">
      Noch keinen Account? <a href="register_form.php">Jetzt registrieren</a>
    </div>
  </div>

  <script>
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    const box = document.getElementById("errorBox");
    if (error === "1") { box.textContent = "Benutzername oder Passwort ist falsch."; box.style.display = "block"; }
    else if (error === "2") { box.textContent = "Server- oder Datenbankfehler. Bitte später erneut versuchen."; box.style.display = "block"; }
    else if (error === "csrf") { box.textContent = "Ungültige Anfrage. Bitte Seite neu laden."; box.style.display = "block"; }
  </script>
</body>
</html>