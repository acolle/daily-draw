# Daily Draw

A private daily drawing habit tracker. Two users each upload one drawing per day. Built with Vite + TypeScript frontend and Express backend, with Cloudflare R2 for image storage.

## Local setup

```bash
cp .env.example .env
# Edit .env with your credentials

npm install
npm run dev
# Frontend: http://localhost:5183
# API:      http://localhost:3006
```

## Environment variables

| Variable | Description |
|---|---|
| `PORT` | Express server port (default: 3006) |
| `SESSION_SECRET` | Random secret for session cookies |
| `USER1_NAME` | First user's login name |
| `USER1_PASS` | First user's password |
| `USER2_NAME` | Second user's login name |
| `USER2_PASS` | Second user's password |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `R2_BUCKET_NAME` | R2 bucket name (e.g. `daily-draw`) |
| `R2_PUBLIC_URL` | *(optional)* Public bucket URL — skips presigned URLs |

## Cloudflare R2 setup

1. Go to **dash.cloudflare.com** → **R2 Object Storage** → Create bucket
2. Name it `daily-draw` (or anything — set `R2_BUCKET_NAME` to match)
3. Go to **R2** → **Manage R2 API Tokens** → Create token
   - Permissions: **Object Read & Write** for your bucket
   - Copy the **Access Key ID** and **Secret Access Key**
4. Your **Account ID** is in the URL: `dash.cloudflare.com/<account_id>/`
5. *(Optional)* For public image access without presigned URLs:
   - In the bucket settings → enable **R2.dev subdomain** (or add custom domain)
   - Copy the public URL and set `R2_PUBLIC_URL`

## Production deployment

### Build

```bash
npm run build
# Outputs to dist/
```

### Systemd service

Create `/etc/systemd/system/daily-draw.service`:

```ini
[Unit]
Description=Daily Draw
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/daily-draw
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now daily-draw
```

### Cloudflare Tunnel (for custom domain)

1. Install cloudflared if not already: `sudo apt install cloudflared`
2. Go to **dash.cloudflare.com** → **Networking** → **Tunnels** → **Create a tunnel**
3. Name it `daily-draw`, select **Cloudflared** → copy the install token
4. On the server: `sudo cloudflared service install <token>`
5. `sudo systemctl start cloudflared`
6. Back in the dashboard, on the tunnel page → **Published applications** tab:
   - Subdomain: `draw` (or your choice)
   - Domain: `yourdomain.com`
   - Service type: **HTTP**
   - URL: `localhost:3006`
   - Save
7. Your app is now live at `https://draw.yourdomain.com`
