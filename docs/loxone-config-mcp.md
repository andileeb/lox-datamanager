# Loxone Config from another computer

Loxone Config 17.3 (public beta) has its own MCP server: an AI app can read the open
project, place and wire blocks, and save. Config runs on Windows only, and its MCP server
only accepts connections from the same PC. Lox DataManager can pass it on, so you can
keep the Windows PC where it is and work from your Mac (or another PC).

## On the PC with Loxone Config

1. In Loxone Config, open your project and enable the **MCP Server** in the title bar.
2. In Lox DataManager, open **Settings → Share Loxone Config** and switch on
   **Share on local network**. The status shows _Loxone Config found_ once Config's MCP
   server is running. Config picks a new port each time it starts; the app finds it by itself.
3. If Windows asks whether to allow Lox DataManager on the network, allow **private
   networks**. If your home network is set to _Public_ in Windows, change it to _Private_
   (Windows Settings → Network → your connection) — otherwise the other computer can't reach it.
4. Click **Copy** next to the **Connection code** and send it to your other computer.

Keep Lox DataManager and Loxone Config open on this PC while you work.

## On your other computer

1. In Lox DataManager, open **Settings → Loxone Config on another computer**, paste the code
   and click **Connect**. It shows the Config version and number of tools when it works.
2. Pick your AI app under **Connect** and copy the snippet (for Claude Code: run it in a
   terminal). The AI app then has both servers: `lox-datamanager` for your statistics and
   `loxone-config` for the project.

Example: _"My standby load is high at night — look at my Loxone Config project and
suggest what to change. Ask before changing anything."_

## Safety

- **Local network only**: the app refuses every connection from outside your private
  network, and every request needs the code's token. Loxone's own server has no password.
- **Regenerate** gives a new code; the old one stops working right away.
- The connection is unencrypted inside your network (like the Miniserver's FTP). Don't
  share on networks you don't trust.
- Changes land in the open Config project. Review them, test in the simulation, undo in
  Config if needed. Lox DataManager never sends anything to the Miniserver this way.
