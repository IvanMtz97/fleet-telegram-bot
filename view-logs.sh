#!/bin/bash

# This script provides a quick menu to view different types of logs

echo "------------------------------------------------"
echo "   Fleet Bot Log Viewer"
echo "------------------------------------------------"
echo "1) View Live Bot Logs (tmux attach)"
echo "2) View Gemini Session History (list-sessions)"
echo "3) View Bot error.log (if exists)"
echo "4) Exit"
echo "------------------------------------------------"
read -p "Select an option: " choice

case $choice in
    1)
        echo "Entering tmux session... Press Ctrl+B then D to detach."
        sleep 2
        tmux attach -t gemini-bot
        ;;
    2)
        echo "Retrieving Gemini session history..."
        /Users/miltonmartinez/.nvm/versions/node/v22.12.0/bin/gemini --list-sessions
        ;;
    3)
        if [ -f "error.log" ]; then
            tail -n 50 error.log
        else
            echo "No error.log found."
        fi
        ;;
    *)
        exit
        ;;
esac
