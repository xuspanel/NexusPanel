---
title: "502 Bad Gateway Error"
category: troubleshooting
order: 1
---

The 502 error means nginx cannot reach the NexusPanel backend. Check:

1. Is the service running? `systemctl status nexuspanel`
2. Check logs: `journalctl -u nexuspanel -n 50`
3. Restart: `systemctl restart nexuspanel`

If the license validation fails, the server may exit. Run `sudo bash troubleshoot.sh --repair`.
