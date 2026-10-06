(() => {
  const grid = document.getElementById("videoGrid");
  const modal = document.getElementById("playerModal");
  const player = document.getElementById("videoPlayer");
  const audioPlayer = document.getElementById("audioPlayer");
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
        loadThumbnail(entry.target, entry.target.dataset.mediaId);
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

  async function loadProfileDetails() {
    const profile = await window.SupabaseMediaStore.getProfile();
    const name = document.getElementById("profileName");
    name.textContent = profile.name;
    document.getElementById("profileBio").textContent = profile.bio;
    const avatar = document.getElementById("avatarDisplay");
    avatar.setAttribute("aria-label", `${profile.name}'s profile photo or initials`);
    const image = avatar.querySelector("img");
    if (image) image.alt = profile.name;
  }

  async function loadThumbnail(preview, id) {
    try {
      const file = await window.SupabaseMediaStore.getMediaThumbnail(id);
      if (!file || !preview.isConnected) return;
      if (preview instanceof HTMLVideoElement) {
        preview.crossOrigin = "anonymous";
        preview.addEventListener("loadeddata", () => {
          if (!preview.videoWidth || !preview.videoHeight) return;
          const canvas = document.createElement("canvas");
          canvas.width = preview.videoWidth;
          canvas.height = preview.videoHeight;
          const context = canvas.getContext("2d");
          if (context) {
            try {
              context.drawImage(preview, 0, 0, canvas.width, canvas.height);
              preview.poster = canvas.toDataURL("image/jpeg", 0.82);
            } catch (error) {
              showToast(`The video is available, but its preview image could not be created: ${error.message}`);
            }
          }
        }, { once: true });
      }
      preview.src = file;
      if (preview instanceof HTMLVideoElement) preview.load();
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
    const mediaType = window.SupabaseMediaStore.getMediaType(item);
    if (activeFilter === "Videos") return mediaType === "video";
    if (activeFilter === "Pictures") return mediaType === "image";
    if (activeFilter === "Audio") return mediaType === "audio";
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
      const mediaType = window.SupabaseMediaStore.getMediaType(item);
      const card = document.createElement("article");
      card.className = "video-card";
      const thumbnail = document.createElement(mediaType === "video" || !mediaType ? "div" : "button");
      if (mediaType !== "video" && mediaType) thumbnail.type = "button";
      thumbnail.className = `video-thumb${mediaType === "image" ? " image-thumb" : ""}${mediaType === "video" ? " video-preview" : ""}`;
      const isAudio = mediaType === "audio";
      const isVideo = mediaType === "video";
      thumbnail.setAttribute("aria-label", `${isAudio ? "Listen to" : isVideo ? "Video preview for" : mediaType === "image" ? "View" : "Unsupported media"} ${item.title}`);

      if (mediaType === "image") {
        const image = document.createElement("img");
        image.alt = item.title;
        image.loading = "lazy";
        image.dataset.mediaId = item.id;
        thumbnail.append(image);
        thumbnail.addEventListener("click", () => openViewer(item));
        if (thumbnailObserver) thumbnailObserver.observe(image);
        else loadThumbnail(image, item.id);
      } else if (isVideo) {
        const video = document.createElement("video");
        video.controls = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.setAttribute("aria-label", `${item.title} video preview`);
        video.dataset.mediaId = item.id;
        video.addEventListener("play", () => {
          video.pause();
          openViewer(item);
        }, { once: true });
        thumbnail.append(video);
        if (thumbnailObserver) thumbnailObserver.observe(video);
        else loadThumbnail(video, item.id);
      } else if (isAudio) {
        const art = document.createElement("span");
        art.className = "thumb-art";
        art.setAttribute("aria-hidden", "true");
        thumbnail.append(art);
        const playIcon = document.createElement("span");
        playIcon.className = "play-icon";
        playIcon.setAttribute("aria-hidden", "true");
        playIcon.textContent = "♪";
        thumbnail.append(playIcon);
        thumbnail.addEventListener("click", () => openViewer(item));
      } else {
        thumbnail.textContent = "Unsupported media type";
      }

      const info = document.createElement("div");
      info.className = "video-info";
      const meta = document.createElement("div");
      meta.className = "video-meta";
      const category = document.createElement("span");
      category.className = "video-category";
      category.textContent = isAudio ? "AUDIO" : mediaType === "image" ? "PICTURE" : mediaType === "video" ? "VIDEO" : "UNSUPPORTED";
      const date = document.createElement("span");
      date.className = "video-date";
      date.textContent = formatDate(item.created_at);
      meta.append(category, date);

      const title = document.createElement("h3");
      title.className = "video-title";
      title.textContent = item.title;
      const description = document.createElement("p");
      description.className = "video-description";
      description.textContent = item.description || (isAudio ? "A track in the collection." : isVideo ? "A story in the collection." : mediaType === "image" ? "A picture in the collection." : "This item has an unsupported media type.");
      const footer = document.createElement("div");
      footer.className = "card-footer";
      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.className = "watch-button";
      openButton.textContent = isAudio ? "Listen to audio  ↗" : isVideo ? "Watch video  ↗" : mediaType === "image" ? "View picture  ↗" : "Unavailable";
      openButton.disabled = !mediaType;
      if (mediaType) openButton.addEventListener("click", () => openViewer(item));
      footer.append(openButton);
      info.append(meta, title, description, footer);
      card.append(thumbnail, info);
      grid.append(card);
    }
  }

  async function openViewer(item) {
    const request = ++viewerRequest;
    const mediaType = window.SupabaseMediaStore.getMediaType(item);
    if (!mediaType) {
      showToast("This item has an unsupported media type.");
      return;
    }
    player.pause();
    audioPlayer.pause();
    player.removeAttribute("src");
    player.load();
    audioPlayer.removeAttribute("src");
    audioPlayer.load();
    imageViewer.removeAttribute("src");
    player.hidden = mediaType !== "video";
    audioPlayer.hidden = mediaType !== "audio";
    imageViewer.hidden = mediaType !== "image";
    document.getElementById("playerTitle").textContent = item.title;
    document.getElementById("playerDescription").textContent = item.description || "";
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
    try {
      const file = await window.SupabaseMediaStore.getMediaFile(item.id);
      if (request !== viewerRequest || !modal.classList.contains("open")) return;
      if (!file) throw new Error("The saved media file could not be found.");
      if (mediaType === "video") {
        player.src = file;
        player.load();
        player.play().catch(() => showToast("Press play in the video controls to start playback."));
        return;
      }
      if (mediaType === "audio") {
        audioPlayer.src = file;
        audioPlayer.load();
        audioPlayer.play().catch(() => showToast("Press play in the audio controls to start playback."));
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
    audioPlayer.pause();
    player.removeAttribute("src");
    player.load();
    audioPlayer.removeAttribute("src");
    audioPlayer.load();
    imageViewer.removeAttribute("src");
    modal.classList.remove("open");
    document.body.style.overflow = "";
  }

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
        await Promise.all([
          loadProfilePhoto(),
          loadProfileDetails().catch(error => showToast(`Could not load profile details: ${error.message}`))
        ]);
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
      await Promise.all([
        loadProfilePhoto(),
        loadProfileDetails().catch(error => showToast(`Could not load profile details: ${error.message}`))
      ]);

      setConnection("Connected to the public Supabase media library.", true);
      render();
    } catch (error) {
      setConnection(explainLibraryError(error), false);
      grid.replaceChildren(emptyState("The media library is unavailable.", "Check the Supabase configuration and database setup, then reload."));
      showToast(`Supabase media error: ${error.message}`);
    }
  })();
})();
