(() => {
  const SESSION_KEY = 'alertcitoyen_session_pro';

  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const submitBtn = document.getElementById('login-submit-btn');
  const errorEl = document.getElementById('login-error');

  function redirectByRole(compte) {
    if (compte.role === 'super_admin') {
      window.location.href = '/admin.html';
    } else if (compte.role === 'dispatch') {
      window.location.href = '/dispatch.html';
    } else if (compte.role === 'entite') {
      window.location.href = '/entite.html';
    } else {
      window.location.href = '/';
    }
  }

  // Si déjà connecté, redirige directement.
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (session) redirectByRole(session);
  } catch {
    localStorage.removeItem(SESSION_KEY);
  }

  async function submitLogin() {
    const email = emailInput.value.trim();
    const mot_de_passe = passwordInput.value;
    errorEl.classList.add('hidden');

    if (!email || !mot_de_passe) {
      errorEl.textContent = 'Veuillez renseigner votre email et votre mot de passe.';
      errorEl.classList.remove('hidden');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connexion...';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, mot_de_passe }),
      });
      const data = await res.json();

      if (!res.ok) {
        errorEl.textContent = data.erreur || 'Connexion impossible.';
        errorEl.classList.remove('hidden');
        return;
      }

      localStorage.setItem(SESSION_KEY, JSON.stringify(data));
      redirectByRole(data);
    } catch {
      errorEl.textContent = 'Erreur réseau. Vérifiez votre connexion.';
      errorEl.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Se connecter';
    }
  }

  submitBtn.addEventListener('click', submitLogin);
  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitLogin();
  });
})();
