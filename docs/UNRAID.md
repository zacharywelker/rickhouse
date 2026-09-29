# Installing Rickhouse on Unraid

GitHub Actions publishes the image to GHCR, and Unraid pulls and runs it. The server doesn't need Node.js or a copy of the repo.

**Requires:** Unraid 6.12+ with Community Applications.

## Install

1. In **Apps**, install **Compose Manager Plus**.
2. In **Compose Manager**, create a stack named `rickhouse` and paste in [`docker-compose.yml`](../docker-compose.yml).
3. Set the stack's `.env`:

   ```ini
   POSTGRES_PASSWORD=<long random string>
   SESSION_SECRET=<output of: openssl rand -hex 32>
   POSTGRES_DATA_PATH=/mnt/user/appdata/rickhouse/postgres
   UPLOADS_PATH=/mnt/user/appdata/rickhouse/uploads
   BACKUP_PATH=/mnt/user/backups/rickhouse
   # true only if you reach Rickhouse over HTTPS
   COOKIE_SECURE=false
   ```

   Keep all three paths on the array, not the USB boot drive. Every other setting is optional and documented in [`.env.example`](../.env.example).

4. Click **Compose Up**, then read the admin password from the log. It's printed once, on first start:

   ```sh
   docker logs rickhouse-app
   ```

5. Open `http://<unraid-ip>:1964`, sign in as `admin` with that password, and choose your own.

## Users

Admins manage accounts under **Users** in the menu under their name (top right). From there they can create accounts, reset passwords, make someone an admin, deactivate an account or delete it. New accounts get a temporary password and pick their own at first sign-in.

Each collection is private, including from admins. Spirit categories are the only shared data, and only admins can edit them. Deleting an account deletes its collection. If you might want the account back, deactivate it instead.

## HTTPS and reverse proxies

Behind Caddy, Nginx Proxy Manager, Traefik or Cloudflare, set:

```ini
APP_URL=https://rickhouse.example.com
COOKIE_SECURE=true
TRUSTED_PROXIES=
```

- **`APP_URL`** is the address people type. Email, single sign-on and passkeys need it. It also fixes "invalid origin" errors behind tunnels that rewrite the `Host` header.
- **`TRUSTED_PROXIES`**: Rickhouse allows 5 sign-in attempts a minute per visitor IP, read from `X-Forwarded-For`. If Cloudflare sits in front of your proxy, list [Cloudflare's IP ranges](https://www.cloudflare.com/ips/) here, comma-separated. Otherwise every visitor shares one limit.

Direct LAN access on port `1964` keeps working.

## Bot check and password rules

```ini
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
PASSWORD_BREACH_CHECK=true
COLA_LOOKUP=true
```

- **Cloudflare Turnstile** (optional): create a Turnstile widget in the Cloudflare dashboard for your `APP_URL` hostname and paste in both keys. Sign-in and "forgot password" then show a bot check. Passkey sign-in skips it. Password sign-in then only works through `APP_URL`, not the LAN address. Leave both keys empty to turn it off.
- **Breached passwords:** new passwords are checked against [Have I Been Pwned](https://haveibeenpwned.com/Passwords). Only the first 5 characters of the password's hash are sent. If the server has no internet access, set `PASSWORD_BREACH_CHECK=false`, or choosing a password will fail, including at first sign-in.
- **No reuse:** a new password can't match the current one or any of the 4 before it. There's nothing to configure.
- **Label approvals:** a label's TTB IDs are looked up in TTB's public COLA registry at `www.ttbonline.gov`, which fetches the approval record and label images. If the server has no internet access, set `COLA_LOOKUP=false`. TTB IDs and links to the registry still work.

## Email, single sign-on, two-step sign-in and passkeys

All four need `APP_URL`.

**Email:** enter your SMTP server under **Email** in the admin menu, then click **Send me a test email**. This turns on forgot-password links, emailed invites and resets, password-change notices and emailed two-step codes. The SMTP password is encrypted with `SESSION_SECRET`, so re-enter it if you rotate the secret.

**Single sign-on** (Pocket ID, Authentik, Authelia, Google…):

1. In your provider, create an OIDC client with the redirect URL `<APP_URL>/api/auth/callback/<id>`, where `<id>` is a short ID you pick, e.g. `pocket-id`.
2. In Rickhouse, open **Single sign-on** in the admin menu and add the provider with the same ID, a button name, its issuer URL, and the client ID and secret. For Google, choose the **Google** type. Google only accepts HTTPS callback URLs.
3. Each person links their identity under **Account settings → Linked sign-ins**.

Single sign-on never creates accounts or matches people by email. Password sign-in keeps working.

**Two-step sign-in and passkeys:** each person sets these up under **Account settings**. Passkeys need HTTPS on the `APP_URL` domain. Browsers that support it offer saved passkeys when you click the username field on the sign-in page.

## Updating

In **Docker → Compose**, choose **Update Stack** on `rickhouse`. The new image is pulled and migrations run automatically.

**Coming from a version with `APP_PASSWORD`?** On the first start after updating, Rickhouse creates an `admin` account, gives it your existing collection and prints its password to the log. From then on `APP_PASSWORD` is ignored, and you can delete it from `.env`.

## Backups

Under **Backups** in the admin menu, turn on scheduled backups and choose how often they run and how many to keep. **Run backup now** takes one immediately. Backups are written to `BACKUP_PATH`, so put that on a share your parity or offsite backup covers.

Each backup is a folder:

```text
rickhouse-<timestamp>/
├── database.sql.gz   full pg_dump
├── csv.tar.gz        every table as CSV, readable without Rickhouse
├── uploads/          photos (unchanged files are hardlinked to the previous backup)
└── manifest.txt
```

Old backups are safe to delete. A hardlinked photo is only freed once no backup uses it.

To run backups from the host instead, [`scripts/backup.sh`](../scripts/backup.sh) writes the same layout from a checkout of this repo. Usage is in the comments at the top of the script.

### Restore

The dump replaces whatever is in the database, so check that you're restoring the right backup into the right stack.

```sh
gunzip -c rickhouse-<timestamp>/database.sql.gz | docker exec -i rickhouse-db psql -U rickhouse -d rickhouse
rsync -a --delete rickhouse-<timestamp>/uploads/ /mnt/user/appdata/rickhouse/uploads/
docker restart rickhouse-app
```

To read the data without Rickhouse, extract `csv.tar.gz` and open the CSVs in a spreadsheet, Baserow, NocoDB or similar. The CSVs aren't restorable. Use `database.sql.gz` to restore.

## Troubleshooting

**Keeps restarting:** check `docker logs rickhouse-app` and `docker logs rickhouse-db`. It's usually a missing `.env` value or a bad data path.

**Health check:** `curl http://localhost:1964/api/health` should return `{"status":"ok","database":"up"}`.

**Sign-in does nothing, or you're signed straight back out:** `COOKIE_SECURE` must be `false` over plain HTTP and `true` over HTTPS.

**"Too many tries":** wait a minute. If everyone sees it at once behind Cloudflare, set `TRUSTED_PROXIES`.

**"Invalid origin":** set `APP_URL` to the address in your browser's address bar.

**Bot check fails or never loads:** check that the Turnstile widget's hostname matches `APP_URL`. To turn the check off, clear both `TURNSTILE_*` keys and recreate the container. It's read from `.env`, so this works even when nobody can sign in.

**A COLA lookup fails with a certificate error:** TTB has probably moved to a new certificate issuer. The app includes TTB's intermediate certificate because TTB's server doesn't send it (`src/lib/cola/intermediate.ts`). Update to the latest Rickhouse image, or set `COLA_LOOKUP=false` in the meantime.

**"Couldn't check that password":** the server can't reach Have I Been Pwned. Restore internet access, or set `PASSWORD_BREACH_CHECK=false`.

**Locked out:** an admin can reset anyone's password under **Users**. If no admin can sign in, run the following from the Unraid terminal:

```sh
docker exec rickhouse-app node dist/reset-password.mjs admin
```

It accepts a username or an email, prints a temporary password and signs that account out everywhere. Add `--make-admin` to promote the account at the same time.

**Photos vanish after a restart:** make sure `UPLOADS_PATH` points at a directory on the array.

**Changed `POSTGRES_PASSWORD` and the app can't connect:** the password is only used when the database is first created. Change it inside PostgreSQL with `ALTER USER`, or put back the old value.

**Starting over:** stop the stack and delete the `POSTGRES_DATA_PATH` and `UPLOADS_PATH` directories. This erases your collection and photos, so take a backup first.
