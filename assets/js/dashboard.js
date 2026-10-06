(() => {
  const MAX_MEDIA_SIZE = 2_000_000_000;
  const MAX_IMAGE_SIZE = 25 * 1024 * 1024;
  const locked = document.getElementById("dashboardLocked");
  const app = document.getElementById("dashboardApp");
  const list = document.getElementById("adminMediaList");
  const form = document.getElementById("uploadForm");
  const profileForm = document.getElementById("profileForm");
  const progress = document.getElementById("uploadProgress");
  const progressFill = progress.querySelector("span");
  const thumbnailObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        thumbnailObserver.unobserve(entry.target);
        loadThumbnail(entry.target, entry.target.dataset.mediaId);
      });
    }, { rootMargin: "120px" })
    : null;

  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 6000);
  }

  function showLocked(heading, message, showLogin) {
    app.hidden = true;
    locked.hidden = false;
    document.getElementById("lockedHeading").textContent = heading;
    document.getElementById("lockedMessage").textContent = message;
    document.getElementById("loginLink").hidden = !showLogin;
  }

  function signInRedirect() {
    window.location.replace("../admin.html?redirect=dashboard");
  }

  async function loadItems() {
    const items = await window.SupabaseMediaStore.getAdminMedia();
    thumbnailObserver?.disconnect();
    list.replaceChildren();

    if (!items.length) {
      const message = document.createElement("p");
      message.className = "dashboard-status";
      message.textContent = "Nothing published yet. Add your first item using the form.";
      list.append(message);
      return;
    }

    for (const item of items) {
      const row = document.createElement("article");
      row.className = "media-item";
      const mediaType = window.SupabaseMediaStore.getMediaType(item);
      let preview;
      if (mediaType === "video") {
        preview = document.createElement("video");
        preview.controls = true;
        preview.playsInline = true;
        preview.preload = "metadata";
        preview.setAttribute("aria-label", `${item.title} video preview`);
      } else if (mediaType === "image") {
        preview = document.createElement("img");
        preview.loading = "lazy";
        preview.alt = item.title;
      } else if (mediaType === "audio") {
        preview = document.createElement("div");
        preview.className = "media-preview-audio";
        preview.setAttribute("aria-label", "Audio");
        preview.textContent = "♪";
      } else {
        preview = document.createElement("div");
        preview.className = "media-preview-audio";
        preview.setAttribute("aria-label", "Unsupported media type");
        preview.textContent = "—";
      }
      preview.dataset.mediaId = item.id;
      const details = document.createElement("div");
      const title = document.createElement("h3");
      title.className = "media-title";
      title.textContent = item.title;
      const meta = document.createElement("p");
      meta.className = "media-meta";
      const type = mediaType === "image" ? "Picture" : mediaType === "audio" ? "Audio" : mediaType === "video" ? "Video" : "Unsupported media";
      meta.textContent = `${type} · ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(item.created_at))}`;
      details.append(title, meta);

      const actions = document.createElement("div");
      actions.className = "media-actions";
      const edit = document.createElement("button");
      edit.className = "edit-media";
      edit.type = "button";
      edit.textContent = "Edit";
      edit.setAttribute("aria-label", `Edit ${item.title}`);
      edit.addEventListener("click", () => editItem(item));

      const remove = document.createElement("button");
      remove.className = "delete-media";
      remove.type = "button";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${item.title}`);
      remove.addEventListener("click", async () => {
        if (!window.confirm(`Remove “${item.title}” from the public collection?`)) return;
        remove.disabled = true;
        try {
          const cleanupMessage = await window.SupabaseMediaStore.deleteMedia(item.id);
          await loadItems();
          showToast(cleanupMessage || "Item removed from the public collection.");
        } catch (error) {
          showToast(`Could not remove this item: ${error.message}`);
        } finally {
          remove.disabled = false;
        }
      });
      actions.append(edit, remove);
      row.append(preview, details, actions);
      list.append(row);
      if (mediaType === "image" || mediaType === "video") {
        if (thumbnailObserver) thumbnailObserver.observe(preview);
        else loadThumbnail(preview, item.id);
      }
    }
  }

  function showListError(error) {
    list.replaceChildren();
    const message = document.createElement("p");
    message.className = "dashboard-status";
    message.textContent = `Could not load media items: ${error.message}`;
    list.append(message);
    showToast(`Could not load the media list: ${error.message}`);
  }

  async function editItem(item) {
    const title = window.prompt("Media title:", item.title);
    if (title === null) return;
    const description = window.prompt("Description:", item.description || "");
    if (description === null) return;
    const changes = {
      title: title.trim(),
      description: description.trim()
    };
    if (!changes.title || changes.title.length > 90) {
      showToast("The title must contain 1 to 90 characters.");
      return;
    }
    if (changes.description.length > 280) {
      showToast("The description must be 280 characters or fewer.");
      return;
    }
    try {
      await window.SupabaseMediaStore.updateMedia(item.id, changes);
      await loadItems();
      showToast("Media details updated.");
    } catch (error) {
      showToast(`Could not update this item: ${error.message}`);
    }
  }

  async function loadThumbnail(preview, id) {
    try {
      const url = await window.SupabaseMediaStore.getMediaThumbnail(id);
      if (!url || !preview.isConnected) return;
      preview.src = url;
      if (preview instanceof HTMLVideoElement) preview.load();
    } catch (error) {
      showToast(`Could not load a media thumbnail: ${error.message}`);
    }
  }

  document.getElementById("signOutButton").addEventListener("click", async () => {
    try {
      await window.SupabaseMediaStore.signOut();
      signInRedirect();
    } catch (error) {
      showToast(`Could not sign out: ${error.message}`);
    }
  });

  window.addEventListener("rohit-library-change", event => {
    if (event.detail === "media") {
      loadItems().catch(showListError);
    } else if (event.detail === "profile") {
      loadProfileDetails().catch(error => showToast(`Could not load profile details: ${error.message}`));
    }
  });

  async function loadProfileDetails() {
    const profile = await window.SupabaseMediaStore.getProfile();
    document.getElementById("profileNameInput").value = profile.name;
    document.getElementById("profileBioInput").value = profile.bio;
  }

  profileForm.addEventListener("submit", async event => {
    event.preventDefault();
    const button = document.getElementById("saveProfileButton");
    button.disabled = true;
    button.textContent = "Saving…";

    try {
      await window.SupabaseMediaStore.updateProfile({
        name: document.getElementById("profileNameInput").value,
        bio: document.getElementById("profileBioInput").value
      });
      showToast("Profile details updated.");
    } catch (error) {
      showToast(`Could not update profile details: ${error.message}`);
    } finally {
      button.disabled = false;
      button.textContent = "Save profile";
    }
  });

  document.getElementById("profilePhotoButton").addEventListener("click", () => {
    document.getElementById("profilePhotoInput").click();
  });

  document.getElementById("profilePhotoInput").addEventListener("change", async event => {
    const input = event.currentTarget;
    const file = input.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > MAX_IMAGE_SIZE) {
      showToast("Choose an image smaller than 25 MB.");
      input.value = "";
      return;
    }

    const button = document.getElementById("profilePhotoButton");
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      await window.SupabaseMediaStore.setProfilePhoto(file);
      showToast("Profile picture published to the public collection.");
    } catch (error) {
      showToast(`Could not save the profile picture: ${error.message}`);
    } finally {
      button.disabled = false;
      button.textContent = "Update profile picture";
      input.value = "";
    }
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const file = document.getElementById("mediaFile").files[0];
    const title = document.getElementById("mediaTitle").value.trim();
    const status = document.getElementById("uploadStatus");
    if (!file || !title) {
      showToast("Choose a video or picture and enter a title.");
      return;
    }
    if (!file.type.startsWith("video/") && !file.type.startsWith("image/") && !file.type.startsWith("audio/")) {
      showToast("Choose a supported video, image, or audio file.");
      return;
    }
    if (file.size > MAX_MEDIA_SIZE) {
      showToast("This file exceeds the 2 GB limit. Your Supabase plan may impose a lower limit.");
      return;
    }
    if (file.type.startsWith("image/") && file.size > MAX_IMAGE_SIZE) {
      showToast("Choose a picture smaller than 25 MB.");
      return;
    }
    const button = document.getElementById("publishButton");
    button.disabled = true;
    button.textContent = "Uploading…";
    status.textContent = "Uploading media to Supabase. Keep this tab open until it finishes.";
    progress.classList.add("visible");
    progress.classList.remove("indeterminate");
    progress.removeAttribute("aria-valuenow");
    progress.setAttribute("aria-valuetext", "Uploading media to Supabase");
    progressFill.style.width = "0%";

    try {
      await window.SupabaseMediaStore.addMedia({
        id: crypto.randomUUID(),
        title,
        description: document.getElementById("mediaDescription").value.trim(),
        media_type: file.type.startsWith("audio/") ? "audio" : file.type.startsWith("video/") ? "video" : "image"
      }, file, (uploaded, total) => {
        const percentage = total ? Math.floor((uploaded / total) * 100) : 0;
        progressFill.style.width = `${percentage}%`;
        progress.setAttribute("aria-valuenow", String(percentage));
        progress.setAttribute("aria-valuetext", `Uploaded ${percentage}%`);
        status.textContent = `Uploading media to Supabase: ${percentage}%`;
      });
      form.reset();
      status.textContent = "Published to the Supabase-backed public gallery.";
      await loadItems();
      showToast("Published to the public collection.");
    } catch (error) {
      status.textContent = `Could not publish this media: ${error.message}`;
      showToast(`Could not publish this media: ${error.message}`);
    } finally {
      button.disabled = false;
      button.textContent = "Publish";
      progress.classList.remove("visible");
      progress.removeAttribute("aria-valuetext");
      progress.removeAttribute("aria-valuenow");
    }
  });

  (async () => {
    try {
      const { user, isAdmin } = await window.SupabaseMediaStore.getAdmin();
      if (!user || !isAdmin) {
        if (user) await window.SupabaseMediaStore.signOut();
        signInRedirect();
        return;
      }
      locked.hidden = true;
      app.hidden = false;
      await loadProfileDetails().catch(error => showToast(`Could not load profile details: ${error.message}`));
      try {
        await loadItems();
      } catch (error) {
        showListError(error);
      }
    } catch (error) {
      showLocked("Admin dashboard unavailable", error.message, true);
      showToast(`Could not open the admin dashboard: ${error.message}`);
    }
  })();
})();
