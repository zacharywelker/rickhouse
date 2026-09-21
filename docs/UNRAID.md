# Deploying Rickhouse on Unraid

Rickhouse is a Compose project that builds its own image — there is no
published image on Docker Hub to pull. That makes the **Compose Manager Plus**
plugin the path of least resistance: it understands `build:` sections and can
run a stack whose files live on the array.

The whole thing is about fifteen minutes, most of it the first build.

---

## Before you start

| | |
|---|---|
| Unraid | 6.12 or newer |
| Free space in the Docker vDisk | ~4 GB for the build, most of it reclaimable afterwards |
| Community Applications | installed (it is how you get the plugin) |

The build compiles a Next.js app inside a container. It is the heaviest thing
that happens, it happens once per update, and on a modest box it takes a few
minutes.

---

## 1. Install Compose Manager Plus

**Apps** → search `Compose Manager Plus` → **Install**.

Use *Plus*, not the original **Docker Compose Manager** — the original is
deprecated and no longer updated. If you already have the old one, installing
Plus removes it and takes over.

A **Compose** section appears at the bottom of the **Docker** tab.

---

## 2. Put the source on the array

The source tree has to live on the array, **not** in the plugin's default
project folder. That folder is on the USB flash drive, which is small, slow,
and backed up by flash backups — a `node_modules` tree does not belong there.

Open a terminal (**Terminal** button, top right of the Unraid UI):

```sh
mkdir -p /mnt/user/appdata/rickhouse
cd /mnt/user/appdata/rickhouse
git clone https://github.com/zacharywelker/rickhouse.git source
```

**No `git`?** It is not in Unraid's base install. Either install **NerdTools**
from Community Applications and add the `git` package, or skip git entirely:

```sh
cd /mnt/user/appdata/rickhouse
wget -O main.zip https://github.com/zacharywelker/rickhouse/archive/refs/heads/main.zip
unzip main.zip && mv rickhouse-main source && rm main.zip
```

Without git you re-download the zip to update. With git it is `git pull`.

---

## 3. Write your `.env`

Compose reads `.env` from the directory holding the compose file, so it goes
next to it in `source/`. It is gitignored, so `git pull` will not clobber it.

```sh
cd /mnt/user/appdata/rickhouse/source
cp .env.example .env
openssl rand -hex 32          # copy this for SESSION_SECRET
nano .env
```

Set these five:

```ini
POSTGRES_PASSWORD=<something long>
APP_PASSWORD=<the password you will type to sign in>
SESSION_SECRET=<the openssl output from above>

# Absolute paths, OUTSIDE the source folder. This matters — see the warning.
POSTGRES_DATA_PATH=/mnt/user/appdata/rickhouse/postgres
UPLOADS_PATH=/mnt/user/appdata/rickhouse/uploads
```

> **Set those two paths.** They default to `./data/...`, which is *inside* the
> source folder. Leave them and your database sits in a git working tree, where
> a re-clone, a `git clean`, or deleting the folder to start fresh takes your
> collection with it. Pointing them at siblings of `source/` means you can
> delete and re-clone the source at will and the data does not care.

`PUID=99` and `PGID=100` are already correct for Unraid (`nobody:users`) — the
app drops to that uid/gid so bottle photos land on the share with ownership you
can actually use from SMB and the file manager.

Leave `COOKIE_SECURE=false` unless you are reaching the box over HTTPS.

---

## 4. Register the stack

**Docker** tab → **Compose** → **Add New Stack** → name it `rickhouse`.

Then use **indirect stack** support to point at the compose file on the array
rather than copying it to the flash drive. In the stack's menu choose the
option to select an existing compose file and give it:

```
/mnt/user/appdata/rickhouse/source/docker-compose.yml
```

This keeps one copy of everything: `git pull` updates the compose file the
plugin is already pointing at.

<details>
<summary>If your plugin version has no indirect-stack option</summary>

Edit the stack's compose file in the UI and paste a two-line file that defers
to the real one:

```yaml
include:
  - /mnt/user/appdata/rickhouse/source/docker-compose.yml
```

Relative paths inside the included file resolve against *its* directory, so the
build context still works. Copy your `.env` next to the stack file as well.
</details>

---

## 5. Build and start

From the stack's menu: **Build & Up** (on first run; afterwards the menu offers
**Update & Rebuild**).

Or from the terminal, which shows you the build output as it happens:

```sh
cd /mnt/user/appdata/rickhouse/source
docker compose up -d --build
```

First run does four things in order: builds the app image, starts Postgres,
waits for it to pass its health check, then runs migrations and seeds the
category tree plus the example bottle.

Watch it:

```sh
docker compose logs -f app
```

You want to see `migrations applied`, `seed complete`, then
`rickhouse: starting on port 1964`.

---

## 6. Open it

**http://\<your-unraid-ip\>:1964**

Sign in with `APP_PASSWORD`. Both containers also appear in the **Docker** tab,
and `rickhouse-app` carries a **WebUI** link that goes straight there.

Confirm it is genuinely healthy, not merely running:

```sh
curl http://localhost:1964/api/health
# {"status":"ok","database":"up"}
```

`docker compose ps` should show `rickhouse-app` as `healthy` — that comes from
the same endpoint, so an unhealthy app means the database connection is broken
even if the page loads.

---

## Updating

```sh
cd /mnt/user/appdata/rickhouse/source
git pull
docker compose up -d --build
```

Migrations run automatically on start and are idempotent. Your data is in the
bind-mounted folders, untouched by the rebuild.

Builds leave layers behind. Every few updates:

```sh
docker builder prune -f
```

---

## Reclaiming the port

Unraid's own WebUI is on 80/443, so 1964 collides with nothing by default. If
something else has claimed it, change `APP_PORT` in `.env` — that is the host
side of the mapping only, so nothing inside the container needs to move.

---

## Troubleshooting

**"no space left on device" during the build.** The Docker vDisk is full.
`docker builder prune -f`, then `docker image prune -f`. If it is chronically
tight, raise the vDisk size in **Settings → Docker**.

**App container restarts in a loop.** `docker compose logs app`. Almost always
a missing or too-short variable — the app refuses to start rather than run
insecurely. `SESSION_SECRET` needs 32+ characters, `APP_PASSWORD` needs 8+.

**Sign-in does nothing, no error.** `COOKIE_SECURE=true` while reaching the box
over plain HTTP. The browser is told to only send the cookie over HTTPS, so it
never comes back. Set it to `false`.

**Photos upload but you cannot delete them from SMB.** `PUID`/`PGID` do not
match your share. They should be `99` and `100`.

**Postgres will not start after changing `POSTGRES_PASSWORD`.** That variable
only applies when the data directory is first created. See *Changing the
database password* in the main [README](../README.md).

**Starting completely over.** `docker compose down`, delete the `postgres` and
`uploads` folders, `docker compose up -d`. The seed reappears because the
collection is empty again.

---

## Optional: an icon in the Docker tab

`docker-compose.yml` already sets the WebUI link. To give the container an icon
too, add a second label under `app.labels`:

```yaml
      net.unraid.docker.icon: "https://raw.githubusercontent.com/zacharywelker/rickhouse/main/public/icon.svg"
```

That URL only resolves while the repository is public. Any reachable image URL
works — point it at something on your own server if you would rather.

---

## Sources

- [Compose Manager Plus](https://github.com/mstrhakr/compose_plugin) — the
  maintained replacement for the deprecated Docker Compose Manager, including
  `build:` support and indirect stacks.
- [Unraid forums: Docker labels for template information](https://forums.unraid.net/topic/105284-use-docker-labels-for-unraid-specific-information-in-docker-templates-to-allow-for-a-11-map-between-unraid-templates-and-docker-compose-files/)
  — `net.unraid.docker.webui` and `net.unraid.docker.icon`.
- [NerdTools](https://github.com/UnRAIDES/unRAID-NerdTools) — how to get `git`
  onto Unraid if you want it.
