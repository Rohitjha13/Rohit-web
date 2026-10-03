(() => {
  const recoveryView = document.getElementById("passwordRecovery");
  const form = document.getElementById("recoveryForm");
  const passwordInput = document.getElementById("newPassword");
  const confirmInput = document.getElementById("confirmPassword");
  const submitButton = document.getElementById("recoverySubmit");
  const status = document.getElementById("recoveryStatus");
  let recoveryReady = false;

  function setStatus(message, kind = "") {
    status.textContent = message;
    status.className = `recovery-status${kind ? ` ${kind}` : ""}`;
  }

  function showRecovery() {
    recoveryView.hidden = false;
    document.getElementById("preloader")?.classList.add("done");
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!recoveryReady) {
      setStatus("This password recovery link is invalid or has expired. Request a new link and try again.", "error");
      return;
    }

    const newPassword = passwordInput.value;
    if (!newPassword) {
      setStatus("Enter a new password.", "error");
      passwordInput.focus();
      return;
    }
    if (newPassword !== confirmInput.value) {
      setStatus("The passwords do not match. Please check both fields.", "error");
      confirmInput.focus();
      return;
    }

    submitButton.disabled = true;
    setStatus("Updating your password…");
    try {
      await window.SupabaseMediaStore.updatePassword(newPassword);
      setStatus("Your password has been updated. Redirecting to admin sign in…", "success");
      window.setTimeout(() => window.location.replace("/admin.html"), 900);
    } catch (error) {
      setStatus(error.message || "Could not update your password. Please try again.", "error");
      submitButton.disabled = false;
    }
  });

  try {
    if (!window.SupabaseMediaStore?.isConfigured()) {
      throw new Error("Supabase is not configured. Check assets/js/supabase-config.js.");
    }
    window.SupabaseMediaStore.onAuthStateChange((event, session) => {
      if (event !== "PASSWORD_RECOVERY") return;

      showRecovery();
      recoveryReady = Boolean(session);
      submitButton.disabled = !recoveryReady;
      setStatus(recoveryReady
        ? "Choose a new password for your account."
        : "Your password recovery session is unavailable or has expired. Request a new link and try again.",
      recoveryReady ? "" : "error");
    });
  } catch (error) {
    console.error(`Password recovery is unavailable: ${error.message}`);
  }
})();
