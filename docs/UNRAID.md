# Deploying Rickhouse on Unraid

Get Rickhouse onto your server without turning your server into a development machine.

The normal journey is:

**GitHub → GitHub Actions → GHCR → Unraid → Rickhouse**

GitHub builds the bottle. GHCR stores it. Unraid puts it on the shelf.

You don't need to clone the repo, install Node.js, or build Next.js on the server. That's development work. Your server has better things to do.

## Before you start

You need:

* Unraid 6.12+
* Community Applications installed
* Access to the Rickhouse container image in GHCR

That's about it. Let's put some liquor on the server.

## Step 1: Install Compose Manager Plus

In **Apps**, search for **Compose Manager** and install **Compose Manager Plus**.

This is how we'll manage the Rickhouse stack without spending our afternoon arguing with Docker.

## Step 2: Create the Rickhouse stack

Open **Compose Manager** and create a new stack named:

```text id="lb47tn"
rickhouse
```

Paste the Rickhouse `docker-compose.yml` into the stack.

The Compose file takes care of the boring but important stuff: containers, networking, ports, volumes, and environment variables.

You get to worry about the fun stuff.

## Step 3: Create the environment file

Create the stack's `.env` file:

```ini id="15rpb1"
POSTGRES_PASSWORD=<something-long-and-random>
APP_PASSWORD=<the-password-you-will-use-to-sign-in>
SESSION_SECRET=<64-random-hex-characters>

POSTGRES_DATA_PATH=/mnt/user/appdata/rickhouse/postgres
UPLOADS_PATH=/mnt/user/appdata/rickhouse/uploads
```

Generate a session secret with:

```bash id="udoyyb"
openssl rand -hex 32
```

### Give the database somewhere permanent to live

The PostgreSQL and uploads paths should point to persistent storage on the Unraid array.

Do **not** put the PostgreSQL database on the USB boot drive.

Your database contains the collection. The collection contains the important stuff. The boot drive does not need that kind of responsibility.

The container also runs with:

```ini id="uuockr"
PUID=99
PGID=100
```

These correspond to Unraid's standard `nobody:users` permissions.

### If you're using HTTP vs HTTPS

For plain HTTP:

```ini id="kgsmum"
COOKIE_SECURE=false
```

For HTTPS:

```ini id="t6mn7w"
COOKIE_SECURE=true
```

Get this wrong and you may successfully sign in only to immediately discover that Rickhouse has forgotten who you are.

A deeply unnecessary betrayal.

## Step 4: Start Rickhouse

In Compose Manager, select the `rickhouse` stack and choose **Compose Up**.

Then check the application logs:

```bash id="ev3cy8"
docker logs -f rickhouse-app
```

On first startup, Rickhouse should:

1. Connect to PostgreSQL
2. Run any required migrations
3. Start the application
4. Begin listening on port `1964`

Once it's running, open:

```text id="7odiaj"
http://YOUR-UNRAID-IP:1964
```

Welcome home.

### Check the health endpoint

From the Unraid terminal:

```bash id="d6o0en"
curl http://localhost:1964/api/health
```

A healthy Rickhouse should respond:

```json id="tybxxy"
{"status":"ok","database":"up"}
```

If Rickhouse says the database is up, the database is up. Beautiful. We can all go home.

# Updating Rickhouse

When a new Rickhouse image is published, update the stack through Compose Manager.

In **Docker → Compose → Rickhouse**, use **Update Stack**.

The new image will be pulled and the containers recreated.

Database migrations run automatically when required.

No rebuilding. No cloning. No server-side development environment. Just the new bottle going on the shelf.

# Backups

Rickhouse has two things you really don't want to lose:

* PostgreSQL data
* Uploaded photos/files

The backup script handles both.

For example:

```bash id="4k3z4p"
BACKUP_DIR=/mnt/user/backups/rickhouse ./scripts/backup.sh
```

By default, the script keeps 14 backups.

For a real server, schedule this nightly using Unraid's **User Scripts** plugin.

And occasionally make sure you can actually restore one.

A backup you have never tested is less of a backup and more of a very reassuring bedtime story.

# Troubleshooting

### Rickhouse keeps restarting

Check the application logs:

```bash id="lalcgs"
docker logs rickhouse-app
```

Then check PostgreSQL:

```bash id="0882xr"
docker logs rickhouse-db
```

The usual suspects are incorrect environment variables, database permissions, or PostgreSQL failing to start.

Rick is not hiding the evidence. The logs are right there.

### Sign-in doesn't work

Check:

* `APP_PASSWORD`
* `COOKIE_SECURE`
* whether you're accessing Rickhouse over HTTP or HTTPS
* application logs

If you're using HTTP, make sure:

```ini id="xqowrb"
COOKIE_SECURE=false
```

If you're using HTTPS, make sure it's:

```ini id="t6mn7w"
COOKIE_SECURE=true
```

### Photos disappear after a restart

Check that:

```ini id="ap80s7"
UPLOADS_PATH=/mnt/user/appdata/rickhouse/uploads
```

points to persistent Unraid storage.

If uploads are stored only inside the container, they're temporary.

Containers are disposable.

Your photos of that bottle you bought in Kentucky because you were “definitely not buying any more bourbon” are not.

### PostgreSQL password problems

`POSTGRES_PASSWORD` is used when PostgreSQL initializes its database.

Changing the value in `.env` **after the database already exists does not change PostgreSQL's existing password**.

If you need to change the database password, handle that as a PostgreSQL credential change rather than simply editing `.env`.

This is one of those places where Docker politely lets you make a change that looks like it should work.

It doesn't.

## Starting completely over

If you intentionally want to destroy the Rickhouse installation and its data, stop the stack and remove the persistent PostgreSQL data and uploads directories.

**This is destructive. Make sure you have a backup first.**

The PostgreSQL directory contains your collection data.

The uploads directory contains your photos.

Deleting them is not an uninstall.

It's a small digital fire.
