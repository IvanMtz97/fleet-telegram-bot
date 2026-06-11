#!/bin/bash

SESSION="gemini-bot"

# Get the directory of this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

# Check if tmux is installed
if ! command -v tmux &> /dev/null
then
    echo "❌ Error: tmux is not installed. Please install it first."
    exit 1
fi

# Check if session already exists
tmux has-session -t $SESSION 2>/dev/null

if [ $? != 0 ]; then
  echo "🚀 Starting new tmux session with caffeinate: $SESSION"
  # caffeinate -is prevents system and disk sleep as long as the command is running
  tmux new-session -d -s $SESSION "caffeinate -is node bot.js"
  echo "✅ Bot is running in the background."
  echo "👉 Use 'tmux attach -t $SESSION' to view logs."
else
  echo "⚠️ Session $SESSION already exists. It might already be running."
  echo "👉 Use 'tmux attach -t $SESSION' to check."
fi
