# Rohit — media portfolio

A responsive public media gallery with an administrator login and dashboard. Published media is stored in Supabase Storage and its metadata in `public.media_items`.

## Configure the Supabase project

The frontend configuration is in `assets/js/supabase-config.js`. It contains the project URL and publishable key only. These are designed for browser use; never add a service-role key or other secret to frontend files.

1. In the Supabase Dashboard for the configured project, open **Authentication → Users**. If the administrator account for `rohitjhajha2001@gmail.com` does not already exist, create it there and set its password; the website has no public signup.
2. Confirm the existing Auth user is accepted by `public.is_admin()` and the existing RLS policies permit public published reads and admin writes. Do not rerun table, bucket, or policy creation SQL.
3. In **Authentication → URL Configuration**, set the deployed website URL as the Site URL if it is not already set.
4. Sign in at `/admin.html` with the email and password configured for the Supabase Auth user.

The frontend verifies administrators with the existing `public.is_admin()` function and relies on the project's current RLS policies. It uses the existing media columns `id`, `title`, `description`, `file_path`, `media_type`, `published`, and `created_at`; it does not query or write a category column.

## Run locally

From this project folder, run:

```text
node dev-server.js
```

Open `http://127.0.0.1:8000` for the public gallery and `http://127.0.0.1:8000/admin.html` for admin sign-in. Direct `file://` access is not supported for Supabase Auth.

## Media and access behavior

- Public visitors can search, browse, and play published videos and view published pictures from Supabase.
- Only an authenticated user accepted by the existing `public.is_admin()` function can upload, edit metadata, update the profile photo, or delete content. The same restriction must be enforced by the existing Supabase RLS and Storage policies, not only by the admin page.
- Video and image objects upload into `media` using resumable TUS uploads. Large-file limits are also governed by the Supabase plan and project Storage settings.
- Local IndexedDB uploads from the previous local-only version are not automatically transferred. Download or retain the original files, then upload them through the admin dashboard.
- The Storage bucket is public so visitors can stream published media without signing in. Anyone with a public object URL can access that object; do not upload private media.

## Project structure

```text
.
├── index.html
├── admin.html
├── admin/
│   └── dashboard.html
├── dev-server.js
├── database/
│   └── supabase-inspect.sql   # Read-only schema and policy checks
└── assets/
    ├── css/admin.css
    └── js/
        ├── app.js
        ├── admin.js
        ├── dashboard.js
        ├── supabase-config.js
        └── supabase-store.js
```
