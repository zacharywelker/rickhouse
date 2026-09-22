# Deploying Rickhouse on Unraid

The app image is built by GitHub Actions and published to GitHub Container
Registry, so your server pulls a finished image instead of compiling Next.js.
Setup is two text files and a button — no clone, no build, no `git` on Unraid.

About ten minutes.

---

## Before you start

| | |
|---|---|
| Unraid | 6.12 or newer |
| Community Applications | installed (it is how you get the plugin) |
| The GHCR package | readable — see [step 0](#0-make-the-image-pullable) |

---

## 0. Make the image pullable

The first workflow run publishes `ghcr.io/zacharywelker/rickhouse`, and **new
GHCR packages are private by default**. A private package means `docker pull`
on Unraid fails with `denied` or `manifest unknown`, which looks like the image
does not exist.

Pick one:

**Make it public** (simplest for a personal project — the image contains no
secrets, only application code that is already in a public repo):

> github.com/users/zacharywelker/packages/container/rickhouse/settings →
> **Danger Zone** → **Change visibility** → **Public**

**Or keep it private** and log Unraid in once. Create a
[personal access token](https://github.com/settings/tokens) with the
`read:packages` scope, then from the Unraid terminal:

```sh
echo '<your-token>' | docker login ghcr.io -u zacharywelker --password-stdin
```

The credential persists in `/root/.docker/config.json`, which does not survive
a reboot on Unraid — so if you go this route, add that command to a **User
Scripts** entry set to run at array start.

---

## 1. Install Compose Manager Plus

**Apps** → search `Compose Manager Plus` → **Install**.

Use *Plus*, not the original **Docker Compose Manager** — the original is
deprecated and no longer updated. If you already have the old one, installing
Plus removes it and takes over.

A **Compose** section appears at the bottom of the **Docker** tab.

---

## 2. Create the stack

**Docker** tab → **Compose** → **Add New Stack** → name it `rickhouse`.

Click the stack's cog → **Edit Stack** → **Compose File**, and paste the
contents of [`docker-compose.yml`](../docker-compose.yml) from this repository.

Nothing in it needs editing — every value you might change comes from `.env`
in the next step.

---

## 3. Write your `.env`

Same cog → **Edit Stack** → **Env File**. Paste
[`.env.example`](../.env.example), then set these:

```ini
POSTGRES_PASSWORD=<something long>
APP_PASSWORD=<the password you will type to sign in>
SESSION_SECRET=<64 random hex characters>

# Absolute paths on your array. See the warning below.
POSTGRES_DATA_PATH=/mnt/user/appdata/rickhouse/postgres
UPLOADS_PATH=/mnt/user/appdata/rickhouse/uploads
```

Generate the secret from the Unraid terminal:

```sh
openssl rand -hex 32
```

> **Set those two paths.** They default to `./data/...`, relative to the stack
> folder — which lives on the **USB flash drive**. A Postgres database does not
> belong on the boot stick: it is slow, it is small, and flash backups would
> try to copy it. Absolute paths on the array are not optional here.

`PUID=99` and `PGID=100` are already correct for Unraid (`nobody:users`) — the
app drops to that uid/gid so bottle photos land on the share with ownership you
can actually use from SMB and the file manager.

Leave `COOKIE_SECURE=false` unless you reach the box over HTTPS.

---

## 4. Up

From the stack's menu: **Compose Up**. It pulls two images — the app from GHCR
and stock `postgres:16-alpine` — and starts them.

First run does three things in order: starts Postgres, waits for it to pass its
health check, then runs migrations and seeds the category tree plus the example
bottle. Watch it:

```sh
docker logs -f rickhouse-app
```

You want `migrations applied`, `seed complete`, then
`rickhouse: starting on port 1964`.

---

## 5. Open it

**http://\<your-unraid-ip\>:1964**

Sign in with `APP_PASSWORD`. Both containers appear in the **Docker** tab, and
`rickhouse-app` carries a **WebUI** link that goes straight there.

Confirm it is genuinely healthy, not merely running:

```sh
curl http://localhost:1964/api/health
# {"status":"ok","database":"up"}
```

That endpoint also backs the container's health check, so an `unhealthy`
`rickhouse-app` means the database connection is broken even if the page loads.

---

## Updating

> **`docker compose up -d` on its own will not update anything.** Compose only
> pulls when the tag is missing locally. You already have an image tagged
> `latest`, so it is reused without the registry ever being asked whether
> `latest` now points somewhere else. Tags are mutable pointers and Docker does
> not re-check them on `up`. You have to pull.

**Compose** → stack menu → **Update Stack**, which pulls and recreates. The
plain **Compose Up** entry is the one that appears to do nothing.

From the terminal, the same thing:

```sh
cd /boot/config/plugins/compose.manager/projects/rickhouse
docker compose pull && docker compose up -d
```

Confirm you are on the build you expected:

```sh
docker image inspect ghcr.io/zacharywelker/rickhouse:latest --format '{{index .RepoDigests 0}}'
```

Compare that digest against the one the GitHub Actions run published — the
workflow summary prints the tags it pushed, and `sha-<commit>` always points at
exactly one build.

Migrations run automatically on start and are idempotent. Your data lives in
the bind-mounted folders and is untouched by the update.

The compose file and `.env` on your server are copies, not links to the
repository. Most releases change neither, but when one does, the release notes
say so and you re-paste the changed file before updating.

Old image layers accumulate. Occasionally:

```sh
docker image prune -f
```

### Pinning a version

`RICKHOUSE_TAG=latest` follows `main`. To update deliberately instead, pin a
tag in `.env`:

```ini
RICKHOUSE_TAG=sha-1a2b3c4     # a specific commit
RICKHOUSE_TAG=1.2.0           # a release, once tags exist
```

Rolling back is then editing that line and running Update Stack again — which
is a good reason to pin once you have data you care about.

---

## Backups

The stack ships a backup script. Run it from the stack directory — the same
one holding `docker-compose.yml`:

```sh
cd /boot/config/plugins/compose.manager/projects/rickhouse
BACKUP_DIR=/mnt/user/backups/rickhouse ./scripts/backup.sh
```

It dumps the database through the `db` container, tars the uploads directory,
and prints the restore commands for the archive it just wrote. `BACKUP_KEEP`
controls retention (14 by default).

Point `BACKUP_DIR` at a user share your parity or cloud backup already
covers. The default writes next to the data it is protecting, which does not
survive the disk failing.

To run it nightly, add a cron entry with the **User Scripts** plugin, set to
"Scheduled Daily":

```sh
#!/bin/bash
cd /boot/config/plugins/compose.manager/projects/rickhouse
BACKUP_DIR=/mnt/user/backups/rickhouse ./scripts/backup.sh
```

---

## Troubleshooting

**`denied` or `manifest unknown` when pulling.** The GHCR package is still
private and Unraid is not logged in. See [step 0](#0-make-the-image-pullable).

**App container restarts in a loop.** `docker logs rickhouse-app`. Almost
always a missing or too-short variable — the app refuses to start rather than
run insecurely. `SESSION_SECRET` needs 32+ characters, `APP_PASSWORD` needs 8+.

**Sign-in does nothing, no error.** `COOKIE_SECURE=true` while reaching the box
over plain HTTP. The browser is told to send the cookie only over HTTPS, so it
never comes back. Set it to `false`.

**Photos upload but you cannot delete them from SMB.** `PUID`/`PGID` do not
match your share. They should be `99` and `100`.

**Postgres will not start after changing `POSTGRES_PASSWORD`.** That variable
only applies when the data directory is first created. See *Changing the
database password* in the main [README](../README.md).

**Port 1964 is taken.** Change `APP_PORT` in `.env`. That is the host side of
the mapping only; nothing inside the container moves.

**An update changed nothing.** You ran `docker compose up -d` without pulling
first. See [Updating](#updating) — `up` reuses whatever `latest` already points
at on disk. If you pulled and it still looks unchanged, check the digest you
are actually running:

```sh
docker inspect rickhouse-app --format '{{.Image}}'
docker image inspect ghcr.io/zacharywelker/rickhouse:latest --format '{{.Id}}'
```

Those two matching means the container is running the image you have; if the
image is still the old one, the pull did not happen. A stale browser cache can
also hide a change that did land — hard-reload before concluding anything.

**Starting completely over.** `docker compose down`, delete the `postgres` and
`uploads` folders, bring it up again. The seed reappears because the collection
is empty.

---

## Appendix: building on the server instead

If you would rather not depend on the registry — a private fork, or local
changes you have not pushed — you can build on the box. It costs a few minutes
of CPU per update and some Docker vDisk space.

```sh
mkdir -p /mnt/user/appdata/rickhouse
cd /mnt/user/appdata/rickhouse
git clone https://github.com/zacharywelker/rickhouse.git source
cd source
cp .env.example .env && nano .env        # same values as step 3
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

`git` is not in Unraid's base install — add it via
[NerdTools](https://github.com/UnRAIDES/unRAID-NerdTools), or download the repo
zip instead.

Put the clone on the **array**, not in the plugin's project folder on the flash
drive, and keep the data paths pointed outside the clone so a re-clone or
`git clean` cannot take your collection with it.

To register this with Compose Manager Plus, use its **indirect stack** support
to point at `/mnt/user/appdata/rickhouse/source/docker-compose.yml`.

Reclaim build cache periodically:

```sh
docker builder prune -f
```

---

## Sources

- [Compose Manager Plus](https://github.com/mstrhakr/compose_plugin) — the
  maintained replacement for the deprecated Docker Compose Manager, including
  `build:` support and indirect stacks.
- [Unraid forums: Docker labels for template information](https://forums.unraid.net/topic/105284-use-docker-labels-for-unraid-specific-information-in-docker-templates-to-allow-for-a-11-map-between-unraid-templates-and-docker-compose-files/)
  — `net.unraid.docker.webui` and `net.unraid.docker.icon`.
- [NerdTools](https://github.com/UnRAIDES/unRAID-NerdTools) — how to get `git`
  onto Unraid if you want it.
