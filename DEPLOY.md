# Deploying the Backend — DigitalOcean VPS

## Prerequisites
- A DigitalOcean droplet (Ubuntu 22.04 LTS recommended)
- SSH access to the droplet
- A domain/subdomain pointed to the droplet's IP (optional but recommended)
- Your frontend already hosted at Vercel: `https://learn-sql-practice.vercel.app`

---

## Step 1 — Install Docker on the Droplet

```bash
ssh root@your-droplet-ip
curl -fsSL https://get.docker.com | sh
systemctl enable docker
usermod -aG docker ubuntu   # if using non-root user
```

---

## Step 2 — Copy the Project

```bash
# On your local machine
rsync -avz --exclude='.git' --exclude='node_modules' \
  --exclude='.gsd' --exclude='scripts/tests' \
  ./ user@your-droplet-ip:/opt/sqlquerylab/
```

---

## Step 3 — Create the `.env` File on the Server

SSH in and create `/opt/sqlquerylab/.env`:

```bash
PORT=3000
ALLOWED_ORIGIN=https://learn-sql-practice.vercel.app
SESSION_SECRET=generate-with-openssl-rand-hex-32   # REQUIRED in production
SESSION_TTL=604800                                  # optional, 7 days in seconds
MASTER_PASSWORD=generate-a-strong-random-string-here
```

Generate a strong session secret on your local machine:
```bash
openssl rand -hex 32
```

---

## Step 4 — Build and Start the Container

```bash
cd /opt/sqlquerylab

# Build the image
docker build -t sqlquerylab-api .

# Run the container with data persistence volume
docker run -d \
  --name sqlquerylab-api \
  -p 3000:3000 \
  --restart unless-stopped \
  --env-file .env \
  -v /opt/sqlquerylab/data:/app/data \
  sqlquerylab-api
```

Or use `docker-compose` (recommended for production):

```bash
docker compose up -d
```

Check it's running:
```bash
docker logs -f sqlquerylab-api
curl http://localhost:3000/health
```

---

## Step 5 — Nginx Reverse Proxy (with SSL)

Point a subdomain (e.g. `api.learn-sql-practice.com`) to your droplet via DigitalOcean's Networking → Domains. Then:

```bash
ssh user@your-droplet-ip
sudo apt install nginx certbot python3-certbot-nginx

# Stop nginx briefly for certbot
sudo systemctl stop nginx

# Get SSL certificate
sudo certbot certonly --standalone -d api.learn-sql-practice.com

# Write nginx config
sudo nano /etc/nginx/sites-available/api.sqlquerylab
```

Paste this config:

```nginx
server {
    listen 80;
    server_name api.learn-sql-practice.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/api.sqlquerylab /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## Step 6 — Verify

```bash
curl https://api.learn-sql-practice.com/health
# → {"status":"ok"}
```

Your Vercel frontend will now use `https://api.learn-sql-practice.com` as the API backend.

---

## Step 7 — Update the Frontend to Use the Backend URL

The frontend needs to know the API URL. Set it as an environment variable in Vercel:

- Go to **Vercel Dashboard → learn-sql-practice → Settings → Environment Variables**
- Add: `VITE_API_BASE_URL = https://api.learn-sql-practice.com`
- **Redeploy** the frontend

Then update `app/index.html` to use it:

```html
<script>
  window.API_BASE = 'https://api.learn-sql-practice.com/api';
</script>
```

Or if you prefer to inject it at build time, add this to `vercel.json` in the root of your repo:

```json
{
  "env": {
    "VITE_API_BASE_URL": "https://api.learn-sql-practice.com"
  }
}
```

And update `scripts/apiClient.js` to use it at build time:

```js
const API_BASE = (typeof window !== 'undefined' && window.ENV_API_BASE) || '/api';
```

(Alternatively, set `window.API_BASE` via a `<script>` tag pointing to a config injected by Vercel.)

---

## Authentication

### Session Management
- Sessions are stored in a SQLite database (`$SQLITE_PATH`, default `./data/auth.db`)
- The session cookie is `httpOnly`, `SameSite=Lax`, and `Secure` (in production)
- Session lifetime: 7 days (configurable via `SESSION_TTL`)

### Auth Endpoints
| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST   | `/api/auth/register` | Register a new user | No |
| POST   | `/api/auth/login` | Login and get session | No |
| POST   | `/api/auth/logout` | Invalidate session | Yes |
| GET    | `/api/auth/me` | Get current user info | Yes |

### Protected Routes
All `/api/connections/*` routes require a valid session cookie. Requests without a session cookie receive a `401 Unauthorized` response.

### Register / Login Flow
```bash
# Register
curl -X POST https://api.learn-sql-practice.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"secret123"}'

# Login
curl -X POST https://api.learn-sql-practice.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"secret123"}' \
  -c cookies.txt   # session cookie saved

# Access protected endpoint
curl https://api.learn-sql-practice.com/api/connections \
  -b cookies.txt  # session cookie sent
```

---

## Data Persistence

### SQLite Location
The SQLite database file is stored at `$SQLITE_PATH` (default `./data/auth.db`). This file contains:
- User accounts and password hashes
- Active sessions

### Volume Mount Requirement
**Important:** SQLite uses file-level locking (`flock`). It must be stored on a **local Docker volume**, NOT on NFS or shared network storage, as network filesystems do not support reliable file locking.

```bash
# Correct: mount a local directory
docker run -v /opt/sqlquerylab/data:/app/data ...

# Incorrect: NFS or remote volume
docker run -v nfs-volume:/app/data ...   # will cause corruption
```

### Persisting Sessions Across Restarts
By mounting `/app/data` to a persistent host directory, sessions and user accounts survive container restarts:

```bash
docker run -d \
  --name sqlquerylab-api \
  -v /opt/sqlquerylab/data:/app/data \
  sqlquerylab-api
```

### Docker Compose Reference
For production use, a `docker-compose.yml` is recommended:

```yaml
version: '3.8'
services:
  api:
    build: .
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - backend/.env
    volumes:
      - ./data:/app/data    # persisted SQLite DB
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | Yes | `3000` | HTTP server port |
| `ALLOWED_ORIGIN` | Yes | — | CORS origin (frontend URL) |
| `SESSION_SECRET` | Yes | — | Secret for signing session cookies. **MUST be set in production.** Generate with: `openssl rand -hex 32` |
| `SQLITE_PATH` | No | `./data/auth.db` | Path to SQLite database |
| `BCRYPT_ROUNDS` | No | `12` | Cost factor for password hashing (higher = slower but more secure) |
| `MASTER_PASSWORD` | No | — | Encryption key for SQL Server credentials at rest (Entra ID tokens, SQL Auth passwords). NOT a user login password. Generate with `openssl rand -hex 32` |

---

## Updating the Backend

```bash
# Pull new code, rebuild, restart
cd /opt/sqlquerylab
git pull
docker build -t sqlquerylab-api .
docker rm -f sqlquerylab-api
docker run -d \
  --name sqlquerylab-api \
  -p 3000:3000 \
  --restart unless-stopped \
  --env-file .env \
  -v /opt/sqlquerylab/data:/app/data \
  sqlquerylab-api
```

---

## Troubleshooting

**Container won't start:**
```bash
docker logs sqlquerylab-api
# Check for missing .env variables
```

**CORS errors in browser:**
- Verify `ALLOWED_ORIGIN` in `.env` matches your Vercel URL exactly (no trailing slash)
- Make sure the SSL certificate is valid (`certbot`)

**502 Bad Gateway:**
- Nginx isn't proxying correctly. Check `sudo nginx -t` and `docker logs sqlquerylab-api`
- Container may be crashed — restart with `docker restart sqlquerylab-api`

**Session not persisting across restarts:**
- Verify the `-v /opt/sqlquerylab/data:/app/data` volume mount is present
- Check the mounted host directory exists and is writable: `ls -la /opt/sqlquerylab/data`

**Server throws `'SESSION_SECRET environment variable is required in production'`:**
- Set `SESSION_SECRET` in your `.env` file (generate with `openssl rand -hex 32`)
- Restart the container: `docker restart sqlquerylab-api`
