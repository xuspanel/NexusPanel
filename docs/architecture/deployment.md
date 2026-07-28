# Deployment

NexusPanel is designed for self-hosted deployment on Linux servers. This guide covers installation, systemd management, reverse proxy configuration, and updates.

---

## Installation Methods

### Universal Installer (Recommended)

```bash
bash <(curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install.sh)
```

Auto-detects the OS and delegates to the appropriate installer:

| OS Family | Installer |
|-----------|-----------|
| Ubuntu/Debian | `install-ubuntu.sh` (apt-get + ufw + AppArmor) |
| AlmaLinux/RHEL/CentOS/Rocky | `install-almalinux.sh` (dnf + firewalld + SELinux) |
| Fedora | `install-almalinux.sh` (via thin wrapper) |
| macOS | `install-macos.sh` (Homebrew + LaunchDaemon) |
| Windows | `install-windows.ps1` (Chocolatey + NSSM) |
| Docker | `install-docker.sh` (OS-agnostic) |

### Unattended Install

```bash
bash <(curl -sL https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install.sh) \
  --license=NX-XXXX \
  --domain=panel.example.com \
  --port=3443 \
  --admin-user=admin \
  --admin-pass=YourStrongPass \
  --docker \
  --postgres \
  --unattended
```

### Manual Install

```bash
git clone -b main --single-branch https://github.com/xuspanel/NexusPanel.git
cd NexusPanel
npm install
cp .env.example .env
nano .env  # Set JWT_SECRET and ADMIN_PASS
npm start
```

---

## Environment Configuration

All configuration is in `.env` at the project root:

```bash
# Required
JWT_SECRET=<openssl rand -hex 32>
ADMIN_PASS=<strong-password>

# Server
PORT=3443
NODE_ENV=production
SERVER_LOCATION="Amsterdam, NL"

# SSH
SSH_USER=root

# License
LICENSE_KEY=NX-XXXX
LICENSE_DOMAIN=panel.example.com
LICENSE_SERVER_URL=https://nxl.xus.me/api
LICENSE_SECRET=<hmac-secret>

# Database (optional)
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=<db-password>
```

### Required Variables

| Variable | How to Generate |
|----------|----------------|
| `JWT_SECRET` | `openssl rand -hex 32` |
| `ADMIN_PASS` | Strong password (12+ chars) |
| `LICENSE_KEY` | From https://nxp.xus.me |
| `LICENSE_DOMAIN` | Your panel domain |
| `LICENSE_SECRET` | HMAC shared secret |

### File Permissions

```bash
chmod 600 .env
chmod 700 data/
```

---

## systemd Service

NexusPanel runs as a systemd service for automatic restart and process management.

### Service File

Located at `nexuspanel.service`:

```ini
[Unit]
Description=NexusPanel VPS Control Center
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/nexuspanel
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### Service Management

```bash
# Start
systemctl start nexuspanel

# Stop
systemctl stop nexuspanel

# Restart
systemctl restart nexuspanel

# Status
systemctl status nexuspanel

# Enable on boot
systemctl enable nexuspanel

# View logs
journalctl -u nexuspanel -f
journalctl -u nexuspanel --since "1 hour ago"
```

---

## Reverse Proxy

NexusPanel binds to `127.0.0.1:3443` only. External access requires a reverse proxy.

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name panel.example.com;

    ssl_certificate     /etc/letsencrypt/live/panel.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/panel.example.com/privkey.pem;

    # Modern TLS
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        proxy_pass http://127.0.0.1:3443;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
    }
}
```

**Important headers:**
- `Upgrade` + `Connection` — Required for WebSocket terminal
- `proxy_read_timeout 3600s` — Prevents idle terminal disconnects (1 hour)

### Caddy

```
panel.example.com {
    reverse_proxy 127.0.0.1:3443
}
```

Caddy automatically handles TLS certificates via Let's Encrypt.

### Traefik

```yaml
http:
  routers:
    nexuspanel:
      rule: "Host(`panel.example.com`)"
      service: nexuspanel
      tls:
        certResolver: letsencrypt
  services:
    nexuspanel:
      loadBalancer:
        servers:
          - url: "http://127.0.0.1:3443"
```

---

## Updates

### Upgrade Script (Recommended)

```bash
sudo bash upgrade.sh
```

Performs:
1. Stashes local changes
2. Pulls latest `main` branch
3. Reinstalls production dependencies
4. Restarts the systemd service

### Update Script

```bash
sudo bash update.sh
```

Lighter-weight pull-and-restart cycle without pre/post hooks.

### Manual Update

```bash
cd /opt/nexuspanel
git stash
git pull origin main
npm install --production
systemctl restart nexuspanel
```

### Panel Self-Update

NexusPanel can check for and apply its own updates via the Updates module:

1. **Check**: `GET /api/updates/panel-check`
2. **Apply**: `POST /api/updates/panel-apply`
3. Progress streamed via Server-Sent Events (SSE)

---

## Health Monitoring

### Health Script

```bash
*/5 * * * * /opt/nexuspanel/health.sh
```

Checks:
- Service status (`systemctl is-active nexuspanel`)
- Port listening (`ss -tlnp | grep 3443`)
- Memory usage (threshold-based)
- Disk usage (threshold-based)
- License server reachability
- nginx status
- Node.js memory usage

Auto-restarts the service on critical failures. Logs to `/var/log/nexuspanel-health.log`.

### Diagnostic Wizard

```bash
sudo bash troubleshoot.sh
```

Interactive diagnostics:
- Checks service status
- Verifies port binding
- Validates `.env` configuration
- Tests database connectivity
- Offers auto-repair for common issues

### Error Checklist

```bash
sudo bash errors.sh
```

Diagnoses known issues with solutions:
- Port already in use
- Missing `.env` variables
- Permission denied errors
- Database connection failures
- SSL certificate issues

---

## Firewall Configuration

### firewalld (RHEL/Fedora/AlmaLinux)

```bash
# Allow HTTPS
firewall-cmd --permanent --add-service=https
firewall-cmd --reload

# Allow custom port
firewall-cmd --permanent --add-port=3443/tcp
firewall-cmd --reload
```

### ufw (Ubuntu/Debian)

```bash
# Allow HTTPS
ufw allow https

# Allow custom port
ufw allow 3443/tcp
```

### iptables

```bash
# Allow HTTPS
iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# Allow custom port
iptables -A INPUT -p tcp --dport 3443 -j ACCEPT

# Save rules
iptables-save > /etc/iptables/rules.v4
```

---

## Docker Deployment

### Dockerfile

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3443
CMD ["node", "server.js"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  nexuspanel:
    build: .
    ports:
      - "127.0.0.1:3443:3443"
    volumes:
      - ./.env:/app/.env:ro
      - ./data:/app/data
    restart: always
```

---

## SSL Certificates

### Let's Encrypt (via Certbot)

```bash
# Install certbot
dnf install -y certbot python3-certbot-nginx  # RHEL
apt install -y certbot python3-certbot-nginx   # Debian

# Obtain certificate
certbot --nginx -d panel.example.com

# Auto-renewal (via cron or timer)
certbot renew --quiet
```

### NexusPanel SSL Module

NexusPanel can manage Let's Encrypt certificates for your domains:

1. **Issue**: `POST /api/ssl/issue` — uses `--webroot` mode (no port 80 conflict)
2. **Renew**: `POST /api/ssl/renew/:domain`
3. **Bulk renew**: `POST /api/ssl/renew-all`
4. **Dry run**: `POST /api/ssl/dry-run` — test renewal without actually renewing
5. **Auto-renewal**: `certbot-renew.timer` or cron job

---

## Uninstallation

```bash
sudo bash uninstall.sh
```

Prompts for confirmation. Removes:
- systemd service
- Application files
- Firewall rules (optional)

### Preserve Configuration

```bash
cp /opt/nexuspanel/.env ~/nexuspanel.env.backup
sudo bash uninstall.sh
```

---

## Backup Strategy

### Recommended Backups

| What | How | Frequency |
|------|-----|-----------|
| `data/` directory | NexusPanel backup module | Daily |
| `.env` file | Manual copy | On change |
| PostgreSQL databases | `pg_dump` via backup module | Daily |
| nginx configs | `tar` of `/etc/nginx/` | Weekly |
| SSL certificates | `tar` of `/etc/letsencrypt/` | Weekly |

### Backup Module

NexusPanel includes a built-in backup module with:

- Full system backups (selected directories)
- PostgreSQL dump integration
- Real-time progress with ETA
- Retention policies (auto-delete old backups)
- Scheduled backups via cron
- Survives browser close (server-side execution)

---

*Part of [NexusPanel Documentation](../README.md)*
