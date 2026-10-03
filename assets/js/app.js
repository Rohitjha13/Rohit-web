(() => {
  const grid = document.getElementById("videoGrid");
  const modal = document.getElementById("playerModal");
  const player = document.getElementById("videoPlayer");
  const imageViewer = document.getElementById("imageViewer");
  let media = [];
  let viewerRequest = 0;
  let activeFilter = "All";
  let searchTerm = "";
  let toastTimer;
  const thumbnailObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        thumbnailObserver.unobserve(entry.target);
        loadThumbnail(entry.target, entry.target.dataset.mediaId, entry.target.dataset.image === "true");
      });
    }, { rootMargin: "160px" })
    : null;

  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 5000);
  }

  function setConnection(message, configured) {
    const notice = document.getElementById("connectionNotice");
    notice.classList.toggle("configured", configured);
    notice.classList.toggle("unconfigured", !configured);
    document.getElementById("connectionMessage").textContent = message;
  }

  function explainLibraryError(error) {
    const details = error.message || "The Supabase request failed.";
    if (/permission denied for table media_items/i.test(details)) {
      return `Supabase denied public access to public.media_items. Check the existing anon SELECT grant and RLS policy. Details: ${details}`;
    }
    if (/media_items\.[a-z_]+ does not exist|relation public\.media_items/i.test(details)) {
      return `The public.media_items schema does not match the gallery fields. Expected id, title, description, file_path, media_type, published, and created_at. Details: ${details}`;
    }
    return `Could not load published media: ${details}`;
  }

  async function loadProfilePhoto() {
    try {
      const profilePhoto = await window.SupabaseMediaStore.getProfilePhoto();
      const avatar = document.getElementById("avatarDisplay");
      if (!profilePhoto) {
        avatar.textContent = "RJ";
        return;
      }
      const image = document.createElement("img");
      image.src = profilePhoto;
      image.alt = "Rohit Jha";
      image.onerror = () => showToast("Could not load Rohit's profile photo.");
      avatar.replaceChildren(image);
    } catch (error) {
      showToast(`Could not load the profile photo: ${error.message}`);
    }
  }

  async function loadThumbnail(image, id, isImage) {
    try {
      const file = await window.SupabaseMediaStore.getMediaThumbnail(id, isImage);
      if (!file || !image.isConnected) return;
      image.src = file;
    } catch (error) {
      showToast(`Could not load a media thumbnail: ${error.message}`);
    }
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(new Date(value));
  }

  function emptyState(titleText, descriptionText) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const icon = document.createElement("span");
    icon.className = "empty-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "⌕";
    const title = document.createElement("h3");
    title.textContent = titleText;
    const description = document.createElement("p");
    description.textContent = descriptionText;
    empty.append(icon, title, description);
    return empty;
  }

  function matchesFilter(item) {
    if (activeFilter === "Videos") return item.media_type === "video";
    if (activeFilter === "Pictures") return item.media_type === "image";
    return true;
  }

  function render() {
    thumbnailObserver?.disconnect();
    const visible = media.filter(item => {
      const searchableText = `${item.title} ${item.description || ""}`.toLowerCase();
      return matchesFilter(item) && searchableText.includes(searchTerm);
    });
    document.getElementById("mediaCount").textContent = String(media.length);
    document.getElementById("resultCount").textContent = searchTerm
      ? `${visible.length} result${visible.length === 1 ? "" : "s"} for “${document.getElementById("searchInput").value.trim()}”`
      : `${visible.length} ${visible.length === 1 ? "story" : "stories"}`;

    grid.replaceChildren();
    if (!visible.length) {
      grid.append(emptyState(
        searchTerm ? "No matching stories." : "The first story starts here.",
        searchTerm ? "Try another title, film, or search term." : "Check back soon for the latest additions."
      ));
      return;
    }

    for (const item of visible) {
      const card = document.createElement("article");
      card.className = "video-card";
      const thumbnail = document.createElement("button");
      thumbnail.type = "button";
      thumbnail.className = `video-thumb${item.media_type === "image" ? " image-thumb" : ""}`;
      thumbnail.setAttribute("aria-label", `${item.media_type === "video" ? "Play" : "View"} ${item.title}`);

      if (item.media_type === "image" || item.has_cover) {
        const image = document.createElement("img");
        image.alt = item.media_type === "image" ? item.title : "";
        image.loading = "lazy";
        image.dataset.mediaId = item.id;
        image.dataset.image = String(item.media_type === "image");
        thumbnail.append(image);
      } else {
        const art = document.createElement("span");
        art.className = "thumb-art";
        art.setAttribute("aria-hidden", "true");
        thumbnail.append(art);
      }
      if (item.media_type === "video") {
        const playIcon = document.createElement("span");
        playIcon.className = "play-icon";
        playIcon.setAttribute("aria-hidden", "true");
        playIcon.textContent = "▶";
        thumbnail.append(playIcon);
      }
      thumbnail.addEventListener("click", () => openViewer(item));

      const info = document.createElement("div");
      info.className = "video-info";
      const meta = document.createElement("div");
      meta.className = "video-meta";
      const category = document.createElement("span");
      category.className = "video-category";
      category.textContent = item.media_type === "image" ? "PICTURE" : "VIDEO";
      const date = document.createElement("span");
      date.className = "video-date";
      date.textContent = formatDate(item.created_at);
      meta.append(category, date);

      const title = document.createElement("h3");
      title.className = "video-title";
      title.textContent = item.title;
      const description = document.createElement("p");
      description.className = "video-description";
      description.textContent = item.description || (item.media_type === "video" ? "A story in the collection." : "A picture in the collection.");
      const footer = document.createElement("div");
      footer.className = "card-footer";
      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.className = "watch-button";
      openButton.textContent = item.media_type === "video" ? "Watch video  ↗" : "View picture  ↗";
      openButton.addEventListener("click", () => openViewer(item));
      footer.append(openButton);
      info.append(meta, title, description, footer);
      card.append(thumbnail, info);
      grid.append(card);
      if (item.media_type === "image" || item.has_cover) {
        if (thumbnailObserver) thumbnailObserver.observe(thumbnail.querySelector("img"));
        else loadThumbnail(thumbnail.querySelector("img"), item.id, item.media_type === "image");
      }
    }
  }

  async function openViewer(item) {
    const request = ++viewerRequest;
    player.pause();
    player.removeAttribute("src");
    player.load();
    imageViewer.removeAttribute("src");
    player.hidden = item.media_type !== "video";
    imageViewer.hidden = item.media_type !== "image";
    document.getElementById("playerTitle").textContent = item.title;
    document.getElementById("playerDescription").textContent = item.description || "";
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
    try {
      const file = await window.SupabaseMediaStore.getMediaFile(item.id);
      if (request !== viewerRequest || !modal.classList.contains("open")) return;
      if (!file) throw new Error("The saved media file could not be found.");
      if (item.media_type === "video") {
        player.src = file;
        player.load();
        player.play().catch(() => showToast("Press play in the video controls to start playback."));
        return;
      }
      imageViewer.src = file;
      imageViewer.alt = item.title;
    } catch (error) {
      if (request !== viewerRequest) return;
      showToast(`Could not open this media: ${error.message}`);
      closeViewer();
    }
  }

  function closeViewer() {
    viewerRequest += 1;
    player.pause();
    player.removeAttribute("src");
    player.load();
    imageViewer.removeAttribute("src");
    modal.classList.remove("open");
    document.body.style.overflow = "";
  }

  document.getElementById("videosNav").addEventListener("click", () => {
    document.getElementById("library").scrollIntoView({ behavior: "smooth" });
  });
  document.getElementById("aboutNav").addEventListener("click", () => {
    document.getElementById("about").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  document.getElementById("closePlayer").addEventListener("click", closeViewer);
  modal.addEventListener("click", event => { if (event.target === modal) closeViewer(); });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && modal.classList.contains("open")) closeViewer();
  });
  window.addEventListener("pagehide", () => {
    thumbnailObserver?.disconnect();
  }, { once: true });
  document.getElementById("searchInput").addEventListener("input", event => {
    searchTerm = event.target.value.trim().toLowerCase();
    render();
  });
  document.querySelectorAll(".filter").forEach(button => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      document.querySelectorAll(".filter").forEach(filter => filter.classList.toggle("active", filter === button));
      render();
    });
  });

  window.addEventListener("rohit-library-change", async event => {
    try {
      if (event.detail === "media") {
        media = await window.SupabaseMediaStore.getMedia();
        render();
      } else if (event.detail === "profile") {
        await loadProfilePhoto();
      }
    } catch (error) {
      showToast(`Could not refresh the collection: ${error.message}`);
    }
  });

  (async () => {
    try {
      if (!window.SupabaseMediaStore?.isConfigured()) {
        throw new Error("Supabase is not configured. Check assets/js/supabase-config.js.");
      }
      setConnection("Loading published media from Supabase…", true);
      media = await window.SupabaseMediaStore.getMedia();
      await loadProfilePhoto();

      setConnection("Connected to the public Supabase media library.", true);
      render();
    } catch (error) {
      setConnection(explainLibraryError(error), false);
      grid.replaceChildren(emptyState("The media library is unavailable.", "Check the Supabase configuration and database setup, then reload."));
      showToast(`Supabase media error: ${error.message}`);
    }
  })();
})();
