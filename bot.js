require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

const token = process.env.TELEGRAM_BOT_TOKEN;
const allowedUserId = parseInt(process.env.ALLOWED_USER_ID);
const geminiPath = process.env.GEMINI_CLI_PATH || 'gemini';

if (!token || !allowedUserId) {
  console.error('Error: TELEGRAM_BOT_TOKEN and ALLOWED_USER_ID must be set in .env');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

let currentGeminiProcess = null;
let outputBuffer = '';
let errorBuffer = '';
let bufferTimeout = null;
let statusMessageId = null;

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR);

const SYSTEM_RULES = `[SYSTEM RULES]
- Context First: You MUST always start by reading '~/dev/docs.md' to understand the system architecture, credentials, app status, and Pull Request/GitHub conventions.
- Scope: Work across all directories within '~/dev'. Base is '~/dev'.
- Shell Access: Use 'run_shell_command' for system inspection.
- Pull Requests: When asked to create a PR, strictly follow the naming and structure conventions documented in 'docs.md'.
- Frontend Verification: For 'fleet-fe' or UI tasks, verify with 'chrome-devtools-mcp' + 'take_screenshot'.
- Screenshot Storage: ALWAYS save to: '${SCREENSHOT_DIR}/screenshot_XXXX.png'.
- Final Status: At the end, state: "RESULT: SUCCESS" or "RESULT: FAILURE" with reason.
[/SYSTEM RULES]

Prompt: `;

function flushBuffer(chatId) {
  if (outputBuffer.trim()) {
    const cleanOutput = outputBuffer.replace(/[\u001b\u009b][[()#;?]*(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d]*)*)?[A-PRZcf-ntqry=><~]/g, '');
    if (cleanOutput.trim()) {
      const chunks = cleanOutput.match(/[\s\S]{1,4000}/g) || [];
      chunks.forEach(chunk => {
        bot.sendMessage(chatId, '```\n' + chunk + '\n```', { parse_mode: 'Markdown' }).catch(err => {
          console.error('[TMUX] Failed to send text chunk:', err.message);
          bot.sendMessage(chatId, chunk);
        });
      });
    }
  }
  outputBuffer = '';
}

function sendNewScreenshots(chatId) {
  if (!fs.existsSync(SCREENSHOT_DIR)) return;
  const files = fs.readdirSync(SCREENSHOT_DIR);
  files.forEach(file => {
    if (file.endsWith('.png')) {
      const filePath = path.join(SCREENSHOT_DIR, file);
      console.log(`[TMUX] Sending screenshot: ${file}`);
      bot.sendPhoto(chatId, filePath).then(() => {
        const processedDir = path.join(SCREENSHOT_DIR, 'sent');
        if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir);
        fs.renameSync(filePath, path.join(processedDir, file));
      }).catch(err => console.error('[TMUX] Error sending photo:', err.message));
    }
  });
}

function runGeminiPrompt(chatId, text, isConfirmation = false) {
  if (isConfirmation && currentGeminiProcess) {
    console.log(`[TMUX] Input: ${text}`);
    currentGeminiProcess.stdin.write(text + '\n');
    return;
  }

  if (currentGeminiProcess) {
    try { currentGeminiProcess.kill(); } catch (e) {}
  }

  const fullPrompt = SYSTEM_RULES + text;
  const args = [
    '--resume', 'latest',
    '--model', 'gemini-3.1-pro-preview',
    '-e', 'chrome-devtools-mcp',
    '--skip-trust',
    '--approval-mode', 'yolo',
    '--prompt', fullPrompt
  ];

  console.log('------------------------------------------------');
  console.log(`[TMUX] NEW REQUEST: ${new Date().toISOString()}`);
  console.log(`[TMUX] Prompt: ${text}`);
  console.log('------------------------------------------------');

  errorBuffer = '';

  bot.sendMessage(chatId, "⏳ *Gemini is starting (Full Access)...*", { parse_mode: 'Markdown' })
    .then(msg => { statusMessageId = msg.message_id; });

  try {
    currentGeminiProcess = spawn(geminiPath, args, {
      shell: false,
      cwd: path.join(os.homedir(), 'dev'),
      env: process.env
    });

    let toolCallCount = 0;
    const updateStatus = (statusText) => {
      if (statusMessageId) {
        bot.editMessageText(`🤖 *Status:* ${statusText}`, {
          chat_id: chatId,
          message_id: statusMessageId,
          parse_mode: 'Markdown'
        }).catch(() => {});
      }
    };

    currentGeminiProcess.stdout.on('data', (data) => {
      const dataStr = data.toString();
      process.stdout.write(`[STDOUT] ${dataStr}`);
      outputBuffer += dataStr;

      if (dataStr.includes('Tool call:')) {
        toolCallCount++;
        updateStatus(`Running tool #${toolCallCount}...`);
      }

      if (dataStr.includes('[Y/n]') || dataStr.includes('(y/N)')) {
        flushBuffer(chatId);
        bot.sendMessage(chatId, "⚠️ *Permission Required:* Do you want to proceed?", {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Yes', callback_data: 'confirm_y' },
              { text: '❌ No', callback_data: 'confirm_n' }
            ]]
          }
        });
      }

      if (bufferTimeout) clearTimeout(bufferTimeout);
      bufferTimeout = setTimeout(() => flushBuffer(chatId), 2000);
    });

    currentGeminiProcess.stderr.on('data', (data) => {
      const dataStr = data.toString();
      process.stderr.write(`[STDERR] ${dataStr}`);
      if (dataStr.includes('429') || dataStr.toLowerCase().includes('error') || dataStr.includes('failed')) {
        errorBuffer += dataStr;
      }
    });

    currentGeminiProcess.on('exit', (code) => {
      console.log(`[TMUX] Gemini process exited with code ${code}`);
      const success = (code === 0);
      
      updateStatus(success ? "✅ Task finished successfully." : `❌ Task failed (Code: ${code})`);
      
      setTimeout(() => {
        if (outputBuffer.trim()) flushBuffer(chatId);
        
        if (errorBuffer.trim()) {
           const cleanError = errorBuffer.replace(/[\u001b\u009b][[()#;?]*(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d]*)*)?[A-PRZcf-ntqry=><~]/g, '');
           bot.sendMessage(chatId, `⚠️ *Technical Warnings:*\n\`\`\`\n${cleanError.substring(0, 500)}\n\`\`\``).catch(() => {});
        }
        
        sendNewScreenshots(chatId);
        
        // Final explicit summary message
        const summary = success ? "🎉 *Request Completed!* Check the output above." : "⚠️ *Request Ended with Errors.* See details.";
        bot.sendMessage(chatId, summary, { parse_mode: 'Markdown' }).catch(() => {
          bot.sendMessage(chatId, summary.replace(/\*/g, ''));
        });

        // Echo the original prompt for reference
        bot.sendMessage(chatId, `📝 *Original Prompt:* ${text}`, { parse_mode: 'Markdown' }).catch(() => {
          bot.sendMessage(chatId, `📝 Original Prompt: ${text}`);
        });
      }, 3000);
      
      currentGeminiProcess = null;
    });

  } catch (err) {
    console.error(`[TMUX] FATAL ERROR: ${err.message}`);
    bot.sendMessage(chatId, `❌ Fatal Error: ${err.message}`);
  }
}

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  if (chatId !== allowedUserId) return;
  const text = msg.text;
  if (!text) return;

  if (text === '/start' || text === '/reset') {
    bot.sendMessage(chatId, '🚀 *Fleet Bot Ready*\nSend your prompt.');
    return;
  }
  runGeminiPrompt(chatId, text);
});

bot.on('callback_query', (callbackQuery) => {
  const action = callbackQuery.data;
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  if (chatId !== allowedUserId) return;

  if (action === 'confirm_y') {
    runGeminiPrompt(chatId, 'y', true);
    bot.answerCallbackQuery(callbackQuery.id, { text: 'Confirmed' });
    bot.editMessageText('✅ *Confirmed*', { chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown' });
  } else if (action === 'confirm_n') {
    runGeminiPrompt(chatId, 'n', true);
    bot.answerCallbackQuery(callbackQuery.id, { text: 'Cancelled' });
    bot.editMessageText('❌ *Cancelled*', { chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown' });
  }
});

console.log('[TMUX] Bot running. Rules updated for PR conventions and prompt echoing.');
