<?php
require __DIR__ . "/csrf.php";
csrf_init();
csrf_verify_or_die();

$servername = "localhost";
$dbname = "users_db";
$dbuser = "root";
$dbpass = "";

try {
  $conn = new PDO("mysql:host=$servername;dbname=$dbname;charset=utf8mb4", $dbuser, $dbpass);
  $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  $username = trim($_POST["username"] ?? "");
  $password = $_POST["password"] ?? "";

  if ($username === "" || $password === "") {
    header("Location: index.php?error=1");
    exit;
  }

  $stmt = $conn->prepare("SELECT id, username, password FROM users WHERE username = ?");
  $stmt->execute([$username]);
  $user = $stmt->fetch(PDO::FETCH_ASSOC);

  if ($user && password_verify($password, $user["password"])) {
    session_regenerate_id(true);
    $_SESSION["user_id"] = $user["id"];
    $_SESSION["username"] = $user["username"];
    header("Location: dashboard.php");
    exit;
  }

  header("Location: index.php?error=1");
  exit;

} catch (PDOException $e) {
  header("Location: index.php?error=2");
  exit;
}