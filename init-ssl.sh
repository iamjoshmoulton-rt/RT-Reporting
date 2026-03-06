#!/bin/bash
#
# First-time SSL certificate setup for reporting.refreshedtech.com
# Run this ONCE on the server after cloning the repo.
#
# Usage: sudo bash init-ssl.sh

set -e

DOMAIN="reporting.refreshedtech.com"
EMAIL="ozzy@refreshedtech.com"

echo "==> Creating temporary self-signed certificate so nginx can start..."
docker compose -f docker-compose.prod.yml run --rm --entrypoint "" certbot sh -c "
  mkdir -p /etc/letsencrypt/live/$DOMAIN &&
  openssl req -x509 -nodes -days 1 -newkey rsa:2048 \
    -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
    -out /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
    -subj '/CN=$DOMAIN'
"

echo "==> Starting nginx with temporary certificate..."
docker compose -f docker-compose.prod.yml up -d frontend

echo "==> Waiting for nginx to be ready..."
sleep 5

echo "==> Removing temporary self-signed certificate..."
docker run --rm --entrypoint "" \
  -v rt_reporting_certbot_certs:/etc/letsencrypt \
  certbot/certbot \
  sh -c "rm -rf /etc/letsencrypt/live/$DOMAIN /etc/letsencrypt/renewal/$DOMAIN.conf /etc/letsencrypt/archive/$DOMAIN"

echo "==> Requesting real certificate from Let's Encrypt..."
docker run --rm \
  -v rt_reporting_certbot_webroot:/var/www/certbot \
  -v rt_reporting_certbot_certs:/etc/letsencrypt \
  certbot/certbot certonly \
  --webroot \
  -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email

echo "==> Reloading nginx with real certificate..."
docker compose -f docker-compose.prod.yml exec frontend nginx -s reload

echo "==> Starting all services..."
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "Done! reporting.refreshedtech.com is now live with HTTPS."
echo "Certbot will auto-renew certificates every 12 hours."
