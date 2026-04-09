# Cloudflare Tunnel Setup

Cloudflare Tunnel lets you expose Postpone to the internet **without opening any ports on your router or firewall**. The `cloudflared` container makes an outbound-only connection to Cloudflare's edge network — all traffic flows through that encrypted tunnel. Your home IP address is never exposed.

## How it works

```
Browser → Cloudflare Edge → cloudflared container → client container (Docker-internal)
                                                          ↓ (nginx proxy)
                                                      api container (Docker-internal)
                                                          ↓
                                                      db container  (Docker-internal)
```

`db` and `api` have no host-port bindings in the production compose file. They are only reachable inside the Docker network.

---

## Prerequisites

- A **Cloudflare account** (free tier is fine)
- A **domain** managed by Cloudflare (DNS must be on Cloudflare's nameservers)

If you don't have a domain yet, you can register one through Cloudflare Registrar or transfer an existing one.

---

## Step 1 — Enable Zero Trust

1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com).
2. In the left sidebar, click **Zero Trust**.
3. If this is your first time, follow the prompt to set up a Zero Trust organisation. Choose a team name (anything works, e.g. `myfamily`). Select the **Free** plan.

---

## Step 2 — Create a tunnel

1. In the Zero Trust dashboard, go to **Networks → Tunnels**.
2. Click **Create a tunnel**.
3. Select **Cloudflared** as the connector type, then click **Next**.
4. Give the tunnel a name (e.g. `postpone`), then click **Save tunnel**.
5. On the next screen, Cloudflare shows you an install command. You only need the **token** from it — it looks like a long base64 string after `--token`. Copy it.

---

## Step 3 — Configure your `.env` file

Open your `.env` file (copied from `.env.example`) and paste the token:

```
CLOUDFLARE_TUNNEL_TOKEN=eyJhI...your-token-here...
```

---

## Step 4 — Configure a public hostname

Still on the tunnel page in the Cloudflare dashboard:

1. Click the **Public Hostname** tab.
2. Click **Add a public hostname**.
3. Fill in:
   | Field | Value |
   |-------|-------|
   | **Subdomain** | `postpone` (or leave blank to use the root domain) |
   | **Domain** | your domain, e.g. `example.com` |
   | **Type** | `HTTP` |
   | **URL** | `client:8080` |
4. Click **Save hostname**.

This tells Cloudflare to route `https://postpone.example.com` to the `client` container inside your Docker network. The nginx inside that container handles the `/api/` and `/hubs/` routing automatically.

> **HTTPS is handled by Cloudflare automatically** — you get a valid TLS certificate at the edge with no extra configuration.

---

## Step 5 — Update `APP_URL` in your `.env`

Set `APP_URL` to your public hostname so notification links resolve correctly:

```
APP_URL=https://postpone.example.com
```

---

## Step 6 — Start the stack

```bash
docker compose -f docker-compose.prod.yml up -d
```

Check the tunnel is connected:

```bash
docker compose -f docker-compose.prod.yml logs cloudflared
```

You should see a line like:

```
Registered tunnel connection connIndex=0 ...
```

Open `https://postpone.example.com` in your browser — it should load Postpone.

---

## Step 7 — Verify the tunnel status in Cloudflare

Back in **Zero Trust → Networks → Tunnels**, your tunnel should show a green **Healthy** status within a minute of starting the stack.

---

## Optional — Add Cloudflare Access (extra auth layer)

You can put an additional login gate in front of Postpone so that only people you approve can even reach the login page. This is useful if you want a second layer of security beyond Postpone's own auth.

1. In Zero Trust, go to **Access → Applications**.
2. Click **Add an application → Self-hosted**.
3. Set the **Application domain** to match your public hostname.
4. Under **Policies**, add a policy that allows your email addresses (or an entire email domain).
5. Save. Cloudflare will now challenge unapproved visitors before they reach Postpone.

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Tunnel shows **Inactive** | Check `docker logs` for the cloudflared container; verify the token is correct in `.env` |
| 502 Bad Gateway | The `client` container may not be ready yet — check `docker compose ps` |
| SignalR disconnects frequently | Cloudflare's default timeout is 100 s for HTTP. Go to your domain's **Network → WebSockets** settings and ensure WebSockets are enabled (they are by default on all plans) |
| App loads but API calls fail | Confirm the public hostname URL is `client:8080` (not `localhost:8080` or `api:8080`) |
