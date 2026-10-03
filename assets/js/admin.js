(() => {
  const form = document.getElementById("adminForm");
  const usernameInput = document.getElementById("identifier");
  const passwordInput = document.getElementById("password");
  const passwordToggle = document.getElementById("passwordToggle");
  const submitButton = document.getElementById("submitButton");
  const status = document.getElementById("statusMessage");
  const params = new URLSearchParams(window.location.search);
  submitButton.disabled = true;

  function setStatus(message, kind) {
    status.textContent = message;
    status.className = `status${kind ? ` ${kind}` : ""}`;
  }

  passwordToggle.addEventListener("click", () => {
    const showingPassword = passwordInput.type === "password";
    passwordInput.type = showingPassword ? "text" : "password";
    passwordToggle.textContent = showingPassword ? "Hide" : "Show";
    passwordToggle.setAttribute("aria-pressed", String(showingPassword));
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const email = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      setStatus("Enter your administrator email and password.", "error");
      passwordInput.focus();
      return;
    }

    submitButton.disabled = true;
    setStatus("Signing in securely…", "");
    try {
      await window.SupabaseMediaStore.signIn(email, password);
      window.location.replace("admin/dashboard.html");
    } catch (error) {
      passwordInput.value = "";
      setStatus(error.message || "Sign-in failed. Check your details and try again.", "error");
    } finally {
      submitButton.disabled = false;
    }
  });

  (async () => {
    try {
      if (!window.SupabaseMediaStore?.isConfigured()) {
        throw new Error("Supabase is not configured. Check assets/js/supabase-config.js.");
      }
      const { user, isAdmin } = await window.SupabaseMediaStore.getAdmin();
      submitButton.disabled = false;
      if (user && isAdmin) {
        window.location.replace("admin/dashboard.html");
        return;
      }
      if (user && !isAdmin) {
        await window.SupabaseMediaStore.signOut();
        setStatus("This account is not authorized as the site administrator.", "error");
      } else if (params.get("redirect") === "dashboard") {
        setStatus("Sign in to open the admin dashboard.", "");
      }
    } catch (error) {
      setStatus(`Admin sign-in is unavailable: ${error.message}`, "error");
      submitButton.disabled = false;
    }
  })();
})();
