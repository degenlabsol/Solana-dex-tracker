require('dotenv').config();
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const chatId = process.env.TELEGRAM_CHAT_ID;
const interval = parseInt(process.env.SCAN_INTERVAL_MS) || 20000;

const seen = new Set();

async function fetchBoosts() {
    const res = await fetch('https://api.dexscreener.com/token-boosts/latest/v1');
    return await res.json();
}

async function fetchTokenData(address) {
    const res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${address}`);
    return await res.json();
}

function formatNumber(num) {
    if (!num) return "0";
    if (num >= 1e6) return (num / 1e6).toFixed(1) + "M";
    if (num >= 1e3) return (num / 1e3).toFixed(1) + "K";
    return num.toFixed(2);
}

async function sendMessage(msg) {
    try {
        await bot.sendMessage(chatId, msg, {
            parse_mode: "Markdown",
            disable_web_page_preview: true
        });
    } catch (e) {
        console.log("Telegram error:", e.message);
    }
}

async function scan() {
    console.log("🔍 scanning...");
    const boosts = await fetchBoosts();

    const sol = boosts.filter(t => t.chainId === "solana");

    for (let t of sol) {
        if (seen.has(t.tokenAddress)) continue;
        seen.add(t.tokenAddress);

        const tokenData = await fetchTokenData(t.tokenAddress);
        if (!tokenData || !tokenData[0]) continue;

        const pair = tokenData[0];

        const name = pair.baseToken.name;
        const symbol = pair.baseToken.symbol;
        const price = parseFloat(pair.priceUsd);
        const mc = pair.marketCap;
        const vol = pair.volume.h24;
        const liquidity = pair.liquidity.usd;
        const change1h = pair.priceChange.h1;

        const message = `
🚀 *${name}* ($${symbol})
\`${t.tokenAddress}\`

📊 *Stats*
├ Price: $${price.toFixed(6)}
├ MC: $${formatNumber(mc)}
├ Vol: $${formatNumber(vol)}
├ LP: $${formatNumber(liquidity)}
└ 1H: ${change1h}%

🔥 *Boost:* ${t.totalAmount}

🔗 [DEX Screener](${pair.url})
        `;

        await sendMessage(message);
    }
}

console.log("🤖 Bot running...");
scan();
setInterval(scan, interval);
