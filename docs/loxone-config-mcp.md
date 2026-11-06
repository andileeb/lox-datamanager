# Loxone Config from another computer

Loxone Config 17.3 (public beta) has its own MCP server: an AI app can read the open
project, place and wire blocks, and save. Config runs on Windows only, and its MCP server
only accepts connections from the same PC. Lox DataManager can pass it on, so you can
keep the Windows PC where it is and work from your Mac (or another PC).

```
Mac                                      Windows PC (or Parallels VM)
AI app (Claude Code, …)                  Loxone Config 17.3+, project open
  └─ http://<pc>:12010/mcp + token ───►  Lox DataManager ─► Config's MCP (this PC only)
```

You need Lox DataManager on **both** computers, in the same local network.

## On the PC with Loxone Config

1. In Loxone Config, open your project and enable the **MCP Server** in the title bar.
2. In Lox DataManager, open **Settings → AI → Share Loxone Config** and switch on
   **Share on local network**. The status shows _Loxone Config found_ once Config's MCP
   server is running. Config picks a new port each time it starts; the app finds it by itself.
3. If Windows asks whether to allow Lox DataManager on the network, allow **private
   networks**. If your home network is set to _Public_ in Windows, change it to _Private_
   (Windows Settings → Network → your connection) — otherwise the other computer can't reach it.
4. Click **Copy** next to the **Connection code** and send it to your other computer.

Keep Lox DataManager and Loxone Config open on this PC while you work.

## On your other computer

1. In Lox DataManager, open **Settings → AI → Loxone Config on another computer**, paste the code
   and click **Connect**. It shows the Config version and number of tools when it works.
2. Under **Claude** (same tab), click **Add** next to Claude Code or Claude Desktop. The app
   writes both servers into Claude's settings: `lox-datamanager` for your statistics and
   `loxone-config` for the project. Start a new Claude Code session; Claude Desktop asks to
   install each one as an extension — click **Install** twice.
   If you added Claude before, it gets `loxone-config` automatically. For other AI apps,
   **Other AI apps & advanced** has the snippet.

When the code changes (Regenerate on the PC, new address), paste the new one and click
**Connect** — Claude's settings follow by themselves.

## Try it

Start a new session in your AI app (Claude Code: `/mcp` shows `loxone-config` as
connected). Start with something that only reads:

- _"Use loxone-config: how many pages and function blocks does my open project have?
  Don't change anything."_

Then a small change you can take back:

- _"Add a page 'Test' with one AND block, then show me. Don't save."_ — check it in
  Config, then _"Undo that."_ The page disappears again.

And the combination with your statistics:

- _"My standby load is high at night — look at my Loxone Config project and suggest what
  to change. Ask before changing anything."_ — or the ready-made prompt **improve-config**
  (see [Ask AI about your data](insights.md#change-loxone-config-from-your-data)).

## Parallels on a Mac

Loxone Config also runs in Windows on Parallels, on the same Mac:

- Use the **arm64** Windows installer on Apple-silicon Macs (the x64 one runs emulated).
- With Parallels' **Shared Network** the VM has a `10.211.55.x` address, with **Bridged**
  an address from your router. Both work; the code shows the right one.
- Windows often marks the Parallels network as _Public_ — set it to _Private_ (see step 3
  above).

## If it doesn't connect

| Message on the Mac                                                        | What to do                                                                                                                                                                         |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _The PC did not answer_                                                   | Is Lox DataManager open on the PC with sharing on? Same network? Network set to _Private_ in Windows and the app allowed in the firewall?                                          |
| _The code is not valid any more_                                          | The code was regenerated — copy the current one from the PC.                                                                                                                       |
| _Reached the PC, but Loxone Config … is not running there_                | Open Loxone Config and enable its MCP Server in the title bar. Then click ↻ next to the status on the PC.                                                                          |
| _Refused — only computers on the same local network_                      | You're connecting through a VPN or from outside; this only works inside your local network.                                                                                        |
| Claude Desktop: _couldn't connect to Loxone Config (via Lox DataManager)_ | macOS asks every app before it may reach your local network. Allow **Claude** under System Settings → Privacy & Security → **Local Network**, then quit and reopen Claude Desktop. |

The PC's address can change when your router hands out a new one — copy the code again then.

## Safety

- **Local network only**: the app refuses every connection from outside your private
  network, and every request needs the code's token. Loxone's own server has no password.
- **Regenerate** gives a new code; the old one stops working right away. Do it whenever
  the code was visible somewhere else (a chat, a screenshot), then connect again with the new one.
- Anyone who has the code can change your Config project — treat it like a password.
- The connection is unencrypted inside your network (like the Miniserver's FTP). Don't
  share on networks you don't trust.
- Changes land in the open Config project. Review them, test in the simulation, undo in
  Config if needed. Lox DataManager never sends anything to the Miniserver this way.
