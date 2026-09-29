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
- **`TRUSTED_PROXIES`**: Rickhouse allows 5 sign-in attempts a minute per visitor IP. It takes the visitor to be the last address in `X-Forwarded-For`, the one your proxy added. When something else sits in front of that proxy, such as Cloudflare, the last address is Cloudflare's, so list those addresses here and Rickhouse looks past them. Otherwise every visitor shares one limit. The sections below say what each setup needs.

Direct LAN access on port `1964` keeps working. In the examples, `192.168.1.10` stands for your Unraid server's LAN address.

### Cloudflare Tunnel

In Cloudflare Zero Trust, add a public hostname to your tunnel: `rickhouse.example.com`, service type **HTTP**, URL `192.168.1.10:1964`.

```ini
TRUSTED_PROXIES=
```

Cloudflare adds the visitor's IP to the end of `X-Forwarded-For`, and `cloudflared` passes it on unchanged, so there's nothing to list. Point the tunnel straight at Rickhouse rather than through another proxy. If you do route it through Caddy, Nginx Proxy Manager or Traefik, that proxy sees every visitor as `cloudflared`: follow its "Behind Cloudflare" steps below, using `cloudflared`'s address instead of Cloudflare's ranges.

### Caddy

```caddyfile
rickhouse.example.com {
	reverse_proxy 192.168.1.10:1964
}
```

```ini
TRUSTED_PROXIES=
```

Caddy replaces any `X-Forwarded-For` a visitor sends with the address it sees, so nothing more is needed.

**Behind Cloudflare** (the DNS record's proxy status is orange): Caddy would see every visitor as a Cloudflare server. Tell Caddy to keep Cloudflare's `X-Forwarded-For`, and tell Rickhouse to look past Cloudflare. Use the ranges listed at [cloudflare.com/ips](https://www.cloudflare.com/ips/), separated by spaces for Caddy and by commas for Rickhouse:

```caddyfile
{
	servers {
		trusted_proxies static 173.245.48.0/20 103.21.244.0/22 ...
	}
}
```

```ini
TRUSTED_PROXIES=173.245.48.0/20,103.21.244.0/22,...
```

### Nginx Proxy Manager

Add a proxy host: domain `rickhouse.example.com`, scheme `http`, forward hostname/IP `192.168.1.10`, port `1964`. On the **SSL** tab, request a certificate and turn on **Force SSL**. Then, on the **Advanced** tab, paste:

```nginx
real_ip_header proxy_protocol;
```

```ini
TRUSTED_PROXIES=
```

NPM adds the address it sees to the end of `X-Forwarded-For`. Without the Advanced line, though, NPM lets any request arriving from a Cloudflare, AWS CloudFront or private address (a `cloudflared` container, for one) replace that address with whatever its `X-Real-IP` header says. Visitors could then dodge the sign-in limit by making up addresses. The Advanced line turns that off for this host only.

**Behind Cloudflare** (orange proxy status): keep the Advanced line and list Cloudflare's ranges from [cloudflare.com/ips](https://www.cloudflare.com/ips/):

```ini
TRUSTED_PROXIES=173.245.48.0/20,103.21.244.0/22,...
```

### Traefik

With the file provider (put your own entry point and certificate resolver names in):

```yaml
http:
  routers:
    rickhouse:
      rule: Host(`rickhouse.example.com`)
      entryPoints: [websecure]
      service: rickhouse
      tls:
        certResolver: letsencrypt
  services:
    rickhouse:
      loadBalancer:
        servers:
          - url: http://192.168.1.10:1964
```

```ini
TRUSTED_PROXIES=
```

Traefik drops any `X-Forwarded-For` or `X-Real-IP` a visitor sends and adds the address it sees, so nothing more is needed.

**Behind Cloudflare** (orange proxy status): trust Cloudflare's ranges on the entry point in Traefik's static configuration, and list the same ranges in Rickhouse:

```yaml
entryPoints:
  websecure:
    address: ":443"
    forwardedHeaders:
      trustedIPs: ["173.245.48.0/20", "103.21.244.0/22", ...]
```

```ini
TRUSTED_PROXIES=173.245.48.0/20,103.21.244.0/22,...
```

### Check what Rickhouse sees

Sign in through your domain from a phone on mobile data, then run:

```sh
docker exec rickhouse-db psql -U rickhouse -c "SELECT ip_address, user_agent, created_at FROM sessions ORDER BY created_at DESC LIMIT 5;"
```

The newest row should show the phone's public IP. If it shows a Cloudflare address, your proxy's address or a `172.x` Docker address, recheck the steps for your setup.

## Bot check and password rules

```ini
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
TURNSTILE_SKIP_NETWORKS=
PASSWORD_BREACH_CHECK=true
```

- **Cloudflare Turnstile** (optional): create a Turnstile widget in the Cloudflare dashboard for your `APP_URL` hostname and paste in both keys. Sign-in and "forgot password" then show a bot check. Passkey sign-in skips it. Password sign-in then only works through `APP_URL`, not the LAN address, unless you set `TURNSTILE_SKIP_NETWORKS`. Leave both keys empty to turn it off.
- **`TURNSTILE_SKIP_NETWORKS`** (optional): lets your LAN sign in without the bot check. List your home network, e.g. `192.168.1.0/24`. A visitor skips the check only when both of these hold:
  - Their IP is in the list. This is the same visitor IP the sign-in limit uses, so set up your proxy as described under [HTTPS and reverse proxies](#https-and-reverse-proxies) first.
  - They opened Rickhouse at an address other than `APP_URL`, e.g. `http://192.168.1.10:1964`. At `APP_URL` everyone gets the check, including LAN devices that reach it through local DNS; the check works there. Anyone coming in through Cloudflare or your reverse proxy arrives at `APP_URL`, so they're always checked. That way a proxy that lets visitors choose their own address can't switch it off.

  This needs `APP_URL`; without it, nobody skips. List only your LAN, not Docker's `172.16.0.0/12` or every private range. And don't port-forward `1964` to the internet: a direct connection can claim any address.
- **Breached passwords:** new passwords are checked against [Have I Been Pwned](https://haveibeenpwned.com/Passwords). Only the first 5 characters of the password's hash are sent. If the server has no internet access, set `PASSWORD_BREACH_CHECK=false`, or choosing a password will fail, including at first sign-in.
- **No reuse:** a new password can't match the current one or any of the 4 before it. There's nothing to configure.

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

**Bot check fails or never loads:** check that the Turnstile widget's hostname matches `APP_URL`. To turn the check off, clear `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` and recreate the container. It's read from `.env`, so this works even when nobody can sign in.

**Bot check still shows on the LAN:** open Rickhouse at the server's LAN address (`http://192.168.1.10:1964`), not your domain; at `APP_URL` everyone gets the check. `TURNSTILE_SKIP_NETWORKS` must cover the device you're signing in from, and `APP_URL` must be set.

**"Couldn't check that password":** the server can't reach Have I Been Pwned. Restore internet access, or set `PASSWORD_BREACH_CHECK=false`.

**Locked out:** an admin can reset anyone's password under **Users**. If no admin can sign in, run the following from the Unraid terminal:

```sh
docker exec rickhouse-app node dist/reset-password.mjs admin
```

It accepts a username or an email, prints a temporary password and signs that account out everywhere. Add `--make-admin` to promote the account at the same time.

**Photos vanish after a restart:** make sure `UPLOADS_PATH` points at a directory on the array.

**Changed `POSTGRES_PASSWORD` and the app can't connect:** the password is only used when the database is first created. Change it inside PostgreSQL with `ALTER USER`, or put back the old value.

**Starting over:** stop the stack and delete the `POSTGRES_DATA_PATH` and `UPLOADS_PATH` directories. This erases your collection and photos, so take a backup first.
