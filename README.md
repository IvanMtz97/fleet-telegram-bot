# Fleet Bot (Gemini CLI Telegram Bridge)

This project allows you to remotely control the Gemini CLI through a Telegram Bot. It is designed to run persistently inside a `tmux` session on your macOS machine.

## Architecture

- **Node.js Bot:** Uses `node-telegram-bot-api` to communicate with the user.
- **Pseudo-Terminal (PTY):** Uses `node-pty` to spawn the `gemini` CLI, allowing for real-time interaction and capturing of prompts that standard child processes cannot handle.
- **Interactive Prompts:** The bot detects when Gemini is asking for permission (e.g., `[Y/n]`) and sends an Inline Keyboard to Telegram with "Yes" and "No" buttons.

## Prerequisites

- Node.js installed.
- `gemini` CLI installed and available in your PATH.
- `tmux` installed (for persistent sessions).

## Setup

1. Create a bot via [@BotFather](https://t.me/botfather) to get your **HTTP API Token**.
2. Get your numeric **User ID** via [@userinfobot](https://t.me/userinfobot).
3. Copy `.env.example` to `.env` and fill in your values:
   ```bash
   cp .env.example .env
   ```
4. Install dependencies:
   ```bash
   npm install
   ```

## New Admin Features

- **Root Access:** The bot now operates from `~/dev`, allowing it to manage `fleet`, `fleet-iot`, and `fleet-fe` concurrently.
- **Shell Access:** Enabled via `--approval-mode yolo`. The bot can now run commands like `ps`, `ls`, and `tmux` to monitor your apps.
- **Automated Screenshots:** 
  - For frontend tasks, the bot captures screenshots via Chrome DevTools.
  - Screenshots are automatically forwarded to your Telegram chat.
  - Local copies are stored in `fleet-bot/screenshots/`.

## Usage

### Starting the Bot
```bash
./start-bot.sh
```

### Resetting
Send `/reset` to the bot to clear any stuck state and refresh the Admin rules.


## Security

The bot is hardcoded to only respond to the `ALLOWED_USER_ID` specified in your `.env`. Any messages from other users will be ignored.
