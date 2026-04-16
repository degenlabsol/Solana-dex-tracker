require('dotenv').config();
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const interval = parseInt(process.env.SCAN_INTERVAL_MS) || 200000;

if (!token || !chatId) {
    console.error("❌ Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env");
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: false });
const boostTracker = {};

async function sendTelegramMessage(message) {
    try {
        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        console.log('✅ Message sent');
    } catch (error) {
        if (error.response && error.response.statusCode === 429) {
            const retryAfter = (error.response.body.parameters.retry_after || 5) * 1000;
            console.warn(`⚠️ Rate limited. Retrying in ${retryAfter/1000}s`);
            setTimeout(() => sendTelegramMessage(message), retryAfter);
        } else {
            console.error('❌ Telegram Error:', error.message);
        }
    }
}

async function scanSolanaTokens() {
    const url = 'https://api.dexscreener.com/token-boosts/latest/v1';

    try {
        console.log('🔍 Scanning...');
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        if (!Array.isArray(data)) return;

        const solanaTokens = data.filter(t => t.chainId === 'solana');

        for (const token of solanaTokens) {
            const { tokenAddress, totalAmount, description, url } = token;

            if (!boostTracker[tokenAddress] || totalAmount > boostTracker[tokenAddress]) {
                const isNew = !boostTracker[tokenAddress];
                boostTracker[tokenAddress] = totalAmount;

                const header = isNew ? "🚀 *New Solana Boost*" : "🔥 *Boost Update*";

                const message = `${header}\n\n` +
                    `📍 *Address:* \`${tokenAddress}\`\n` +
                    `💰 *Total Boost:* ${totalAmount}\n` +
                    `📝 *Description:* ${description || 'N/A'}\n\n` +
                    `🔗 [View on DEX Screener](${url})`;

                await sendTelegramMessage(message);
            }
        }
    } catch (err) {
        console.error('❌ API Error:', err.message);
    }
}

console.log('🤖 Bot started...');
scanSolanaTokens();
setInterval(scanSolanaTokens, interval);
