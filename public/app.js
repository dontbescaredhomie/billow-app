// --- AUTH ---
async function login() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  const res = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  const data = await res.json();
  document.getElementById('loginMessage').innerText = data.message || data.error;

  if (data.message) window.location.href = "app.html";
}

async function registerUser() {
  const email = document.getElementById('registerEmail').value;
  const pass1 = document.getElementById('registerPassword1').value;
  const pass2 = document.getElementById('registerPassword2').value;

  if (pass1 !== pass2) {
    document.getElementById('registerMessage').innerText = "Lösenorden matchar inte!";
    return;
  }

  const res = await fetch('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass1 })
  });

  const data = await res.json();
  document.getElementById('registerMessage').innerText = data.message || data.error;

  if (data.message) {
    setTimeout(() => window.location.href = "index.html", 1500);
  }
}

