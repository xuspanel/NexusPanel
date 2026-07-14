#!/usr/bin/env bash
set -e

# ─── Colors ───────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; NC='\033[0m'; BOLD='\033[1m'

# ─── Banner ───────────────────────────────────────────
echo -e "${CYAN}"
echo "    ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗"
echo "    ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝"
echo "    ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗"
echo "    ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║"
echo "    ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║"
echo "    ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝"
echo -e "         ${BOLD}NexusPanel — VPS Control Center${NC}"
echo -e "         ${CYAN}Installer v1.0${NC}"
echo ""
echo "============================================================"
echo ""

# ─── Root Check ──────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    echo -e "${YELLOW}Not running as root. Re-executing with sudo...${NC}"
    exec sudo bash "$(realpath "$0" 2>/dev/null || readlink -f "$0" 2>/dev/null || echo "$0")" "$@"
  fi
  echo -e "${RED}Root privileges are required to install system packages and configure services.${NC}"
  echo -e "${RED}Please run with sudo: sudo bash install.sh${NC}"
  exit 1
fi

# ─── OS Detection ────────────────────────────────────
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$ID
  OS_LIKE=$ID_LIKE
else
  echo -e "${RED}Cannot detect OS. Please run on RHEL/CentOS/Alma or Debian/Ubuntu.${NC}"
  exit 1
fi

case "$OS" in
  rhel|centos|almalinux|fedora|rocky) PKG_MGR="dnf"; OS_FAMILY="rhel" ;;
  ubuntu|debian) PKG_MGR="apt"; OS_FAMILY="debian" ;;
  *)
    if [[ "$OS_LIKE" =~ rhel|fedora ]]; then PKG_MGR="dnf"; OS_FAMILY="rhel"
    elif [[ "$OS_LIKE" =~ debian|ubuntu ]]; then PKG_MGR="apt"; OS_FAMILY="debian"
    else echo -e "${RED}Unsupported OS: $OS${NC}"; exit 1; fi
    ;;
esac
echo -e "${GREEN}Detected OS: $OS ($OS_FAMILY) — using $PKG_MGR${NC}"

# ─── License Key Prompt ──────────────────────────────
echo ""
echo "============================================================"
echo -e "${BOLD}Step 1: License Key${NC}"
echo "============================================================"
echo "Enter your NexusPanel license key."
echo "Get one at: https://nxp.xus.me"
echo ""

while true; do
  read -p "License Key [NX-XXXX-XXXX-XXXX]: " LICENSE_KEY
  if [ -z "$LICENSE_KEY" ]; then
    echo -e "${RED}License key is required.${NC}"
    continue
  fi

  echo -e "${CYAN}Validating license key...${NC}"
  VALIDATION=$(curl -sk --connect-timeout 15 --max-time 20 -X POST https://nxl.xus.me/api/validate \
    -H 'Content-Type: application/json' \
    -d "{\"key\":\"$LICENSE_KEY\"}" 2>/dev/null || echo '{"valid":false,"reason":"network_error","code":"CONNECTION_FAILED"}')

  VALID=$(echo "$VALIDATION" | grep -o '"valid":true' || true)

  if [ -n "$VALID" ]; then
    echo -e "${GREEN}✓ License key is valid!${NC}"
    break
  else
    REASON=$(echo "$VALIDATION" | grep -o '"reason":"[^"]*"' | cut -d'"' -f4)
    echo -e "${RED}✗ License validation failed: ${REASON:-unknown}${NC}"
    if [ "$REASON" = "network_error" ]; then
      echo -e "${YELLOW}  Unable to reach the license server (nxl.xus.me).${NC}"
      echo -e "${YELLOW}  Please check your internet connection and firewall settings.${NC}"
      echo -e "${YELLOW}  Port 443 (HTTPS) must be open for outbound traffic.${NC}"
    fi
    echo "Please try again or contact support at nxp@s2u.me."
  fi
done

# ─── Domain Prompt ───────────────────────────────────
echo ""
echo "============================================================"
echo -e "${BOLD}Step 2: Domain Configuration${NC}"
echo "============================================================"
echo "Optionally configure a domain with SSL (nginx + certbot)."
echo "Leave empty to run without a domain (localhost only)."
echo ""

read -p "Domain/subdomain [e.g. panel.example.com] (leave empty to skip): " DOMAIN

if [ -n "$DOMAIN" ]; then
  echo -e "${GREEN}Domain: $DOMAIN${NC}"
  read -p "Email for Let's Encrypt notifications: " EMAIL
  EMAIL=${EMAIL:-admin@$DOMAIN}
else
  echo -e "${YELLOW}No domain configured. NexusPanel will run on localhost.${NC}"
fi

# ─── Port Prompt ─────────────────────────────────────
echo ""
echo "============================================================"
echo -e "${BOLD}Step 3: Port Configuration${NC}"
echo "============================================================"

while true; do
  read -p "Port for NexusPanel [default: 3443]: " PORT
  PORT=${PORT:-3443}

  if command -v ss >/dev/null 2>&1; then
    if ss -tlnp | grep -q ":$PORT "; then
      echo -e "${YELLOW}Port $PORT is in use. Finding next available...${NC}"
      for p in $(seq $((PORT+1)) $((PORT+100))); do
        if ! ss -tlnp | grep -q ":$p "; then
          PORT=$p
          echo -e "${GREEN}Found available port: $PORT${NC}"
          break
        fi
      done
    fi
  fi
  break
done
echo -e "${GREEN}Port: $PORT${NC}"

# ─── Admin Credentials ───────────────────────────────
echo ""
echo "============================================================"
echo -e "${BOLD}Step 4: Admin Account${NC}"
echo "============================================================"

read -p "Admin username [default: admin]: " ADMIN_USER
ADMIN_USER=${ADMIN_USER:-admin}

read -sp "Admin password: " ADMIN_PASS
echo ""
if [ -z "$ADMIN_PASS" ]; then
  echo -e "${RED}Password cannot be empty.${NC}"
  exit 1
fi

# ─── Optional Dependencies ───────────────────────────
echo ""
echo "============================================================"
echo -e "${BOLD}Step 5: Optional Dependencies${NC}"
echo "============================================================"

read -p "Install Docker? [y/N]: " INSTALL_DOCKER
read -p "Install PostgreSQL? [y/N]: " INSTALL_PG
read -p "Install ClamAV (virus scanner)? [y/N]: " INSTALL_CLAMAV
read -p "Install pgAdmin (Docker)? [y/N]: " INSTALL_PGADMIN
if [ "$INSTALL_PGADMIN" = "y" ] || [ "$INSTALL_PGADMIN" = "Y" ]; then
  read -p "pgAdmin email: " PGADMIN_EMAIL
  read -sp "pgAdmin password: " PGADMIN_PASS
  echo ""
fi

# ─── Install System Dependencies ─────────────────────
echo ""
echo "============================================================"
echo -e "${BOLD}Installing system dependencies...${NC}"
echo "============================================================"

JWT_SECRET=$(openssl rand -hex 32)

install_nginx_certbot() {
  if [ "$OS_FAMILY" = "rhel" ]; then
    $PKG_MGR install -y nginx certbot python3-certbot-nginx 2>/dev/null || true
  else
    apt-get update -qq
    apt-get install -y nginx certbot python3-certbot-nginx 2>/dev/null || true
  fi
}

install_nodejs() {
  if command -v node >/dev/null 2>&1; then
    NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VER" -ge 18 ]; then
      echo -e "${GREEN}Node.js $(node -v) already installed.${NC}"
      return
    fi
  fi

  if [ "$OS_FAMILY" = "rhel" ]; then
    $PKG_MGR module enable nodejs:20 -y 2>/dev/null || true
    $PKG_MGR install -y nodejs 2>/dev/null || true
  else
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>/dev/null
    apt-get install -y nodejs 2>/dev/null || true
  fi
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    echo -e "${GREEN}Docker already installed.${NC}"
    return
  fi
  if [ "$OS_FAMILY" = "rhel" ]; then
    $PKG_MGR config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo 2>/dev/null || true
    $PKG_MGR install -y docker-ce docker-ce-cli containerd.io 2>/dev/null || true
  else
    curl -fsSL https://get.docker.com | bash 2>/dev/null || true
  fi
  systemctl enable --now docker 2>/dev/null || true
}

install_postgres() {
  if command -v psql >/dev/null 2>&1; then
    echo -e "${GREEN}PostgreSQL already installed.${NC}"
    return
  fi
  if [ "$OS_FAMILY" = "rhel" ]; then
    $PKG_MGR install -y postgresql-server postgresql-contrib 2>/dev/null || true
    postgresql-setup --initdb 2>/dev/null || true
    systemctl enable --now postgresql 2>/dev/null || true
  else
    apt-get install -y postgresql postgresql-contrib 2>/dev/null || true
  fi
}

install_clamav() {
  if command -v clamscan >/dev/null 2>&1; then
    echo -e "${GREEN}ClamAV already installed.${NC}"
    return
  fi
  if [ "$OS_FAMILY" = "rhel" ]; then
    $PKG_MGR install -y clamav clamav-update 2>/dev/null || true
  else
    apt-get install -y clamav clamav-daemon 2>/dev/null || true
  fi
  mkdir -p /var/lib/clamav
  chown clamupdate:clamupdate /var/lib/clamav 2>/dev/null || true
  freshclam 2>/dev/null || true
}

# Install Git if missing
if ! command -v git >/dev/null 2>&1; then
  $PKG_MGR install -y git 2>/dev/null || true
fi

install_nodejs

if [ -n "$DOMAIN" ]; then
  install_nginx_certbot
fi

[ "$INSTALL_DOCKER" = "y" ] || [ "$INSTALL_DOCKER" = "Y" ] && install_docker
[ "$INSTALL_PG" = "y" ] || [ "$INSTALL_PG" = "Y" ] && install_postgres
[ "$INSTALL_CLAMAV" = "y" ] || [ "$INSTALL_CLAMAV" = "Y" ] && install_clamav

install_pgadmin() {
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^pgadmin$'; then
    echo -e "${GREEN}pgAdmin Docker container already running.${NC}"
    return
  fi
  docker rm -f pgadmin 2>/dev/null || true
  docker run -d --name pgadmin --restart unless-stopped \
    -e PGADMIN_DEFAULT_EMAIL="${PGADMIN_EMAIL:-admin@example.com}" \
    -e PGADMIN_DEFAULT_PASSWORD="${PGADMIN_PASS:-admin}" \
    -p 127.0.0.1:5050:80 \
    dpage/pgadmin4:latest 2>/dev/null
  echo -e "${GREEN}✓ pgAdmin installed (accessible at https://<domain>/pgadmin)${NC}"
}

[ "$INSTALL_PGADMIN" = "y" ] || [ "$INSTALL_PGADMIN" = "Y" ] && install_pgadmin

# ─── Clone and Install App ───────────────────────────
echo ""
echo "============================================================"
echo -e "${BOLD}Installing NexusPanel...${NC}"
echo "============================================================"

INSTALL_DIR="/opt/nexuspanel"

if [ -d "$INSTALL_DIR/.git" ]; then
  echo -e "${CYAN}NexusPanel already exists. Updating...${NC}"
  cd "$INSTALL_DIR"
  git pull origin main 2>/dev/null || true
else
  echo -e "${CYAN}Cloning NexusPanel from GitHub...${NC}"
  git clone https://github.com/xuspanel/NexusPanel.git "$INSTALL_DIR" 2>/dev/null || {
    echo -e "${YELLOW}GitHub clone failed. Falling back to local copy.${NC}"
    mkdir -p "$INSTALL_DIR"
  }
  # Move nxApp contents to root if cloned as subdirectory
  if [ -d "$INSTALL_DIR/nxApp" ]; then
    shopt -s dotglob
    cp -r "$INSTALL_DIR/nxApp/"* "$INSTALL_DIR/" 2>/dev/null
    rm -rf "$INSTALL_DIR/nxApp"
    shopt -u dotglob
  fi
fi

# ─── Write .env ──────────────────────────────────────
echo -e "${CYAN}Configuring environment...${NC}"

cat > "$INSTALL_DIR/.env" << ENVEOF
LICENSE_KEY=$LICENSE_KEY
LICENSE_DOMAIN=$DOMAIN
LICENSE_SERVER_URL=https://nxl.xus.me/api
JWT_SECRET=$JWT_SECRET
PORT=$PORT
NODE_ENV=production
SERVER_LOCATION=Unknown
SSH_USER=root
ADMIN_USER=$ADMIN_USER
ADMIN_PASS=$ADMIN_PASS
PGADMIN_EMAIL=${INSTALL_PGADMIN:+$PGADMIN_EMAIL}
PGADMIN_PASSWORD=${INSTALL_PGADMIN:+$PGADMIN_PASS}
ENVEOF

echo -e "${GREEN}✓ .env configured${NC}"

# ─── npm Install ─────────────────────────────────────
echo -e "${CYAN}Installing Node.js dependencies...${NC}"
cd "$INSTALL_DIR"
npm install --production 2>&1 | tail -3 || {
  npm install 2>&1 | tail -3
}

# ─── Create systemd Service ──────────────────────────
echo -e "${CYAN}Creating systemd service...${NC}"

cat > /etc/systemd/system/nexuspanel.service << SYSTEMD
[Unit]
Description=NexusPanel - VPS Control Panel
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node $INSTALL_DIR/server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SYSTEMD

systemctl daemon-reload
systemctl enable nexuspanel
systemctl start nexuspanel 2>/dev/null || true
echo -e "${GREEN}✓ systemd service created and started${NC}"

# ─── Configure nginx (if domain provided) ────────────
if [ -n "$DOMAIN" ]; then
  echo -e "${CYAN}Configuring nginx for $DOMAIN...${NC}"

  # Step 1: HTTP-only config for certbot validation
  cat > /etc/nginx/conf.d/nexuspanel.conf << NGINX
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
    }
}
NGINX

  rm -f /etc/nginx/conf.d/default.conf 2>/dev/null
  nginx -t 2>/dev/null && systemctl restart nginx 2>/dev/null || nginx 2>/dev/null || true
  echo -e "${GREEN}✓ Nginx configured with HTTP${NC}"

  # Step 2: Obtain SSL certificate
  echo -e "${CYAN}Obtaining SSL certificate via certbot...${NC}"
  certbot certonly --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" 2>&1 || {
    certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" 2>&1 || {
      echo -e "${YELLOW}⚠ certbot could not obtain SSL automatically.${NC}"
      echo -e "${YELLOW}  Make sure DNS for $DOMAIN points to this server's public IP.${NC}"
      echo -e "${YELLOW}  Run manually: certbot --nginx -d $DOMAIN${NC}"
      echo -e "${YELLOW}  The panel will still work on HTTP in the meantime.${NC}"
    }
  }

  # Step 3: Upgrade to HTTPS config (only if cert was obtained)
  if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    cat > /etc/nginx/conf.d/nexuspanel.conf << NGINX
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl;
    server_name $DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
    }

    location /pgadmin/ {
        proxy_pass http://127.0.0.1:5050/;
        proxy_set_header X-Script-Name /pgadmin;
        proxy_set_header Host \$host;
        proxy_redirect off;
    }
}
NGINX
    nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
    echo -e "${GREEN}✓ SSL enabled — https://$DOMAIN${NC}"
  else
    echo -e "${YELLOW}⚠ SSL not configured. Running on HTTP only.${NC}"
    echo -e "${YELLOW}  Access at: http://$DOMAIN${NC}"
  fi
fi

# ─── Configure Firewall ──────────────────────────────
echo -e "${CYAN}Configuring firewall...${NC}"

if command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --add-service=http --permanent 2>/dev/null || true
  firewall-cmd --add-service=https --permanent 2>/dev/null || true
  firewall-cmd --add-port=$PORT/tcp --permanent 2>/dev/null || true
  firewall-cmd --reload 2>/dev/null || true
elif command -v ufw >/dev/null 2>&1; then
  ufw allow 80/tcp 2>/dev/null || true
  ufw allow 443/tcp 2>/dev/null || true
  ufw allow $PORT/tcp 2>/dev/null || true
fi
echo -e "${GREEN}✓ Firewall configured${NC}"

# ─── Final Summary ───────────────────────────────────
echo ""
echo "============================================================"
echo -e "${GREEN}${BOLD}  ✓ NexusPanel Installation Complete!${NC}"
echo "============================================================"
echo ""
echo -e "  ${BOLD}URL:${NC}       https://$DOMAIN:$PORT"
if [ -n "$DOMAIN" ]; then
  echo -e "  ${BOLD}URL:${NC}       https://$DOMAIN"
fi
echo -e "  ${BOLD}Username:${NC}   $ADMIN_USER"
echo -e "  ${BOLD}Password:${NC}   (as entered)"
echo -e "  ${BOLD}License:${NC}    $LICENSE_KEY (registered to: $DOMAIN)"
echo ""
echo -e "  ${BOLD}Service:${NC}    systemctl {start|stop|restart|status} nexuspanel"
echo -e "  ${BOLD}Logs:${NC}       journalctl -u nexuspanel -f"
echo -e "  ${BOLD}Config:${NC}     $INSTALL_DIR/.env"
echo ""
echo -e "${CYAN}Thank you for installing NexusPanel!${NC}"
echo ""
