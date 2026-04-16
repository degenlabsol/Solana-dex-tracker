require('dotenv').config();
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const chatId = process.env.TELEGRAM_CHAT_ID;
const interval = parseInt(process.env.SCAN_INTERVAL_MS) || 20000;

const seen = new Set();

const BIRDEYE_API = "https://public-api.birdeye.so/defi/price";
const HEADERS = {
    "accept": "application/json",
    "x-chain": "solana"
};

function format(num) {
    if (!num) return "0";
    if (num >= 1e6) return (num / 1e6).toFixed(1) + "M";
    if (num >= 1e3) return (num / 1e3).toFixed(1) + "K";
    return num.toFixed(4);
}

async function getBoosts() {
    const res = await fetch("https://api.dexscreener.com/token-boosts/latest/v1");
    return await res.json();
}

async function getToken(address) {
    const res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${address}`);
    return await res.json();
}

async function getBirdeye(address) {
    try {
        const res = await fetch(`${BIRDEYE_API}?address=${address}`, { headers: HEADERS });
        const json = await res.json();
        return json.data;
    } catch {
        return null;
    }
}

async function send(msg) {
    await bot.sendMessage(chatId, msg, {
        parse_mode: "Markdown",
        disable_web_page_preview: true
    });
}

async function scan() {
    console.log("Scanning...");
    const boosts = await getBoosts();

    const sol = boosts.filter(t => t.chainId === "solana");

    for (let t of sol) {
        if (seen.has(t.tokenAddress)) continue;
        seen.add(t.tokenAddress);

        const dex = await getToken(t.tokenAddress);
        if (!dex || !dex[0]) continue;

        const pair = dex[0];
        const bird = await getBirdeye(t.tokenAddress);

        const name = pair.baseToken.name;
        const symbol = pair.baseToken.symbol;

        const price = bird?.value || pair.priceUsd;
        const liquidity = bird?.liquidity || pair.liquidity.usd;
        const change24 = bird?.priceChange24h || 0;

        const mc = pair.marketCap;
        const vol = pair.volume.h24;

        const message = `
🚀 *${name}* ($${symbol})
\`${t.tokenAddress}\`

📊 *Stats*
├ Price: $${parseFloat(price).toFixed(6)}
├ MC: $${format(mc)}
├ Vol: $${format(vol)}
├ LP: $${format(liquidity)}
├ 24H: ${change24.toFixed(2)}%
└ Boost: ${t.totalAmount}

📈 *Links*
[DEX]( ${pair.url} )

⚡ *Signal:* New Boost Detected
        `;

        await send(message);
    }
}

console.log("Bot started...");
scan();
setInterval(scan, interval);
