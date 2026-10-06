(() => {
  const portrait = document.getElementById("profilePhoto");
  const photoStatus = document.getElementById("photoStatus");

  async function loadProfilePhoto() {
    try {
      const photoUrl = await window.SupabaseMediaStore.getProfilePhoto();
      if (!photoUrl) {
        photoStatus.textContent = "Add a profile photo from the admin dashboard to show it here.";
        return;
      }

      const image = document.createElement("img");
      image.src = photoUrl;
      image.alt = "Rohit Jha";
      image.addEventListener("load", () => { photoStatus.textContent = ""; }, { once: true });
      image.addEventListener("error", () => {
        photoStatus.textContent = "The profile photo could not be displayed.";
        portrait.replaceChildren("RJ");
      }, { once: true });
      portrait.replaceChildren(image);
    } catch (error) {
      photoStatus.textContent = `Profile photo unavailable: ${error.message}`;
    }
  }

  if (window.SupabaseMediaStore?.isConfigured()) {
    loadProfilePhoto();
  } else {
    photoStatus.textContent = "Supabase profile photo is unavailable.";
  }
})();
