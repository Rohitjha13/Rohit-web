(() => {
  const config = window.ROHIT_SUPABASE_CONFIG;
  const MEDIA_BUCKET = "media";
  const CHANNEL_NAME = "rohit-supabase-library";
  const changeChannel = "BroadcastChannel" in window
    ? new BroadcastChannel(CHANNEL_NAME)
    : null;

  function notifyChange(kind) {
    window.dispatchEvent(new CustomEvent("rohit-library-change", { detail: kind }));
    changeChannel?.postMessage(kind);
  }

  if (changeChannel) {
    changeChannel.addEventListener("message", event => {
      if (event.data === "media" || event.data === "profile") {
        window.dispatchEvent(new CustomEvent("rohit-library-change", { detail: event.data }));
      }
    });
  }

  function getClient() {
    if (!config?.url || !config?.publishableKey) {
      throw new Error("Supabase is not configured. Check assets/js/supabase-config.js.");
    }
    if (!window.supabase?.createClient) {
      throw new Error("The Supabase client did not load. Check your connection and reload.");
    }
    return client;
  }

  if (!config?.url || !config?.publishableKey) {
    console.error("Supabase configuration is missing. Check assets/js/supabase-config.js.");
  }
  const client = config?.url && config?.publishableKey && window.supabase?.createClient
    ? window.supabase.createClient(config.url, config.publishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true
      }
    })
    : null;

  function throwIfError(error) {
    if (error) throw new Error(error.message || "The Supabase request failed.");
  }

  function getPublicUrl(path, bucket = MEDIA_BUCKET) {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    const storagePath = path.replace(/^\/+/, "");
    return getClient().storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
  }

  function getStoragePath(path) {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) {
      const match = new URL(path).pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/media\/(.+)$/);
      return match?.[1] ? decodeURIComponent(match[1]) : null;
    }
    return path.replace(/^\/+/, "");
  }

  function extensionFor(file) {
    const extension = file.name.match(/\.[a-z0-9]{1,10}$/i)?.[0].toLowerCase();
    return extension || "";
  }

  async function uploadResumable(file, path, onProgress) {
    const { data, error } = await getClient().auth.getSession();
    throwIfError(error);
    if (!data.session) throw new Error("Sign in again to continue uploading.");
    if (!window.tus?.Upload) {
      throw new Error("The resumable upload client did not load. Check your connection and reload.");
    }

    return new Promise((resolve, reject) => {
      const upload = new window.tus.Upload(file, {
        endpoint: `${config.url.replace(/\/+$/, "")}/storage/v1/upload/resumable`,
        headers: {
          apikey: config.publishableKey,
          authorization: `Bearer ${data.session.access_token}`,
          "x-upsert": "false"
        },
        metadata: {
          bucketName: MEDIA_BUCKET,
          objectName: path,
          contentType: file.type || "application/octet-stream",
          cacheControl: "3600"
        },
        chunkSize: 6 * 1024 * 1024,
        retryDelays: [0, 1000, 3000, 5000],
        removeFingerprintOnSuccess: true,
        onError: reject,
        onProgress(bytesUploaded, bytesTotal) {
          onProgress?.(bytesUploaded, bytesTotal);
        },
        onSuccess: resolve
      });
      upload.start();
    });
  }

  async function removeObjects(objects) {
    if (!objects.length) return;
    const { error } = await getClient().storage.from(MEDIA_BUCKET).remove(objects);
    throwIfError(error);
  }

  async function getAdminStatus() {
    const { data: { session }, error: sessionError } = await getClient().auth.getSession();
    throwIfError(sessionError);
    if (!session) return { user: null, isAdmin: false };
    const { data: { user }, error } = await getClient().auth.getUser();
    throwIfError(error);
    if (!user) return { user: null, isAdmin: false };
    const { data, error: adminError } = await getClient().rpc("is_admin");
    throwIfError(adminError);
    return { user, isAdmin: data === true };
  }

  function startRealtime() {
    if (!client || window.rohitRealtimeStarted) return;
    window.rohitRealtimeStarted = true;
    client
      .channel("rohit-public-library")
      .on("postgres_changes", { event: "*", schema: "public", table: "media_items" }, () => notifyChange("media"))
      .subscribe();
  }

  if (client) startRealtime();

  window.SupabaseMediaStore = Object.freeze({
    isConfigured: () => Boolean(config?.url && config?.publishableKey),
    onAuthStateChange(callback) {
      return getClient().auth.onAuthStateChange(callback);
    },
    async updatePassword(password) {
      const { error } = await getClient().auth.updateUser({ password });
      throwIfError(error);
    },
    async getAdmin() {
      return getAdminStatus();
    },
    async signIn(email, password) {
      const { error } = await getClient().auth.signInWithPassword({ email, password });
      throwIfError(error);
      let status;
      try {
        status = await getAdminStatus();
      } catch (adminError) {
        const { error: signOutError } = await getClient().auth.signOut();
        if (signOutError) {
          throw new Error(`${adminError.message} The temporary sign-in could not be cleared: ${signOutError.message}`);
        }
        if (/function public\.is_admin|relation public\.admin_users|permission denied for table admin_users/i.test(adminError.message || "")) {
          throw new Error(`Could not verify this account against public.admin_users using public.is_admin(). Check the existing Supabase function and RLS grants. Details: ${adminError.message}`);
        }
        throw adminError;
      }
      if (!status.isAdmin) {
        const { error: signOutError } = await getClient().auth.signOut();
        throwIfError(signOutError);
        throw new Error("This account is not authorized as the site administrator.");
      }
      return status.user;
    },
    async signOut() {
      const { error } = await getClient().auth.signOut();
      throwIfError(error);
    },
    async getMedia() {
      const { data, error } = await getClient()
        .from("media_items")
        .select("id,title,description,file_path,media_type,published,created_at")
        .eq("published", true)
        .order("created_at", { ascending: false });
      throwIfError(error);
      return data;
    },
    async getAdminMedia() {
      const { data, error } = await getClient()
        .from("media_items")
        .select("id,title,description,file_path,media_type,published,created_at")
        .order("created_at", { ascending: false });
      throwIfError(error);
      return data;
    },
    getMediaFile(id) {
      return getClient()
        .from("media_items")
        .select("file_path")
        .eq("id", id)
        .eq("published", true)
        .single()
        .then(({ data, error }) => {
          throwIfError(error);
          if (!data.file_path) throw new Error("No Storage path is saved for this media item.");
          return getPublicUrl(data.file_path);
        });
    },
    async getMediaThumbnail(id, isImage) {
      const { data, error } = await getClient()
        .from("media_items")
        .select("file_path,media_type")
        .eq("id", id)
        .eq("published", true)
        .single();
      throwIfError(error);
      return isImage && data.media_type === "image" && data.file_path ? getPublicUrl(data.file_path) : null;
    },
    async addMedia(item, file, onProgress) {
      const id = item.id;
      const storagePath = `${id}${extensionFor(file)}`;
      const uploadedPaths = [storagePath];
      const { data: { user }, error: userError } = await getClient().auth.getUser();
      throwIfError(userError);
      if (!user) throw new Error("Sign in again to continue uploading.");

      try {
        await uploadResumable(file, storagePath, onProgress);

        const { error } = await getClient().from("media_items").insert({
          id,
          title: item.title,
          description: item.description,
          file_path: storagePath,
          media_type: item.media_type,
          published: true
        });
        throwIfError(error);
      } catch (error) {
        try {
          await removeObjects(uploadedPaths);
        } catch (cleanupError) {
          throw new Error(`${error.message} Uploaded files could not be cleaned up: ${cleanupError.message}`);
        }
        throw error;
      }
      notifyChange("media");
    },
    async updateMedia(id, changes) {
      const { error } = await getClient()
        .from("media_items")
        .update(changes)
        .eq("id", id);
      throwIfError(error);
      notifyChange("media");
    },
    async deleteMedia(id) {
      const { data: item, error: readError } = await getClient()
        .from("media_items")
        .select("file_path")
        .eq("id", id)
        .single();
      throwIfError(readError);

      const { error } = await getClient().from("media_items").delete().eq("id", id);
      throwIfError(error);
      notifyChange("media");

      const storagePath = getStoragePath(item.file_path);
      if (!storagePath) {
        return "Item removed from the public collection; its Storage file could not be identified for cleanup.";
      }
      const { error: cleanupError } = await getClient().storage.from(MEDIA_BUCKET).remove([storagePath]);
      if (cleanupError) {
        return `The item was unpublished, but its storage files could not be removed: ${cleanupError.message}`;
      }
      return "";
    },
    async getProfilePhoto() {
      const response = await fetch(getPublicUrl("profile/avatar"), { method: "HEAD" });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Could not load the profile photo (HTTP ${response.status}).`);
      return getPublicUrl("profile/avatar");
    },
    async setProfilePhoto(file) {
      const { error } = await getClient().storage.from(MEDIA_BUCKET).upload("profile/avatar", file, {
        cacheControl: "3600",
        contentType: file.type || "application/octet-stream",
        upsert: true
      });
      throwIfError(error);
      notifyChange("profile");
    }
  });
})();
