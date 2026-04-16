require('dotenv').config();
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const chatId = process.env.TELEGRAM_CHAT_ID;
const interval = parseInt(process.env.SCAN_INTERVAL_MS) || 20000;

if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.error("❌ FEHLENDE ENV-VARIABLEN!");
    process.exit(1);
}

const seen = new Set();

const BIRDEYE_API = "https://public-api.birdeye.so/defi/price";
const HEADERS = { "accept": "application/json", "x-chain": "solana" };

function format(num) {
    if (!num) return "0";
    if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
    if (num >= 1e6) return (num / 1e6).toFixed(1) + "M";
    if (num >= 1e3) return (num / 1e3).toFixed(1) + "K";
    return Number(num).toFixed(4);
}

async function getRecentProfiles() {
    try {
        const res = await fetch("https://api.dexscreener.com/token-profiles/recent-updates/v1");
        let data = await res.json();
        return Array.isArray(data) ? data : [data].filter(Boolean);
    } catch { return []; }
}

async function getLatestProfiles() {
    try {
        const res = await fetch("https://api.dexscreener.com/token-profiles/latest/v1");
        let data = await res.json();
        return Array.isArray(data) ? data : [data].filter(Boolean);
    } catch { return []; }
}

async function getTokenPairs(tokenAddress) {
    try {
        const res = await fetch(`https://api.dexscreener.com/token-pairs/v1/solana/${tokenAddress}`);
        const json = await res.json();
        return Array.isArray(json) ? json[0] || json : null; // meist das erste Pair
    } catch { return null; }
}

async function getBirdeye(tokenAddress) {
    try {
        const res = await fetch(`${BIRDEYE_API}?address=${tokenAddress}`, { headers: HEADERS });
        const json = await res.json();
        return json.success ? json.data : null;
    } catch { return null; }
}

async function sendEpicPost(profile, pairData, bird) {
    const name = pairData?.baseToken?.name || "Unknown Token";
    const symbol = pairData?.baseToken?.symbol || "???";
    const tokenAddr = profile.tokenAddress;

    const price = bird?.value || pairData?.priceUsd || 0;
    const mc = pairData?.marketCap || pairData?.fdv || 0;
    const liquidity = bird?.liquidity || pairData?.liquidity?.usd || 0;
    const vol24 = pairData?.volume?.h24 || 0;

    const change5m = pairData?.priceChange?.m5 || 0;
    const change1h = pairData?.priceChange?.h1 || 0;
    const change6h = pairData?.priceChange?.h6 || 0;
    const change24h = bird?.priceChange24h || pairData?.priceChange?.h24 || 0;

    const txns24 = pairData?.txns?.h24 || {};
    const buys24 = txns24.buys || 0;
    const sells24 = txns24.sells || 0;

    const dexUrl = pairData?.url || `https://dexscreener.com/solana/${tokenAddr}`;
    const description = profile.description ? profile.description.substring(0, 220) + (profile.description.length > 220 ? "..." : "") : "No description available yet.";

    let linksText = "";
    if (profile.links && profile.links.length > 0) {
        linksText = "\n🔗 *Links:*\n" + profile.links.map(l => `• [${l.label || l.type}](${l.url})`).join("\n");
    }

    const message = `
🚀 *${name}* ($${symbol}) — **New Token Profile** 🔥

📍 \`${tokenAddr}\`

💰 *Price:* $${parseFloat(price).toFixed(6)}
📊 *MC / FDV:* $${format(mc)}
💧 *Liquidity:* $${format(liquidity)}
📈 *24h Volume:* $${format(vol24)}

📉 *Price Changes*
├ 5m: ${change5m >= 0 ? '🟢' : '🔴'} ${change5m.toFixed(1)}%
├ 1h: ${change1h >= 0 ? '🟢' : '🔴'} ${change1h.toFixed(1)}%
├ 6h: ${change6h >= 0 ? '🟢' : '🔴'} ${change6h.toFixed(1)}%
└ 24h: ${change24h >= 0 ? '🟢' : '🔴'} ${change24h.toFixed(1)}%

🔥 *Activity (24h)*
├ Buys: ${buys24} | Sells: ${sells24}
└ Makers: ${pairData?.txns?.h24?.makers || 'N/A'}

📝 *Description*
${description}

${linksText}

🌐 **[Open on DEX Screener](${dexUrl})**

⚡ *Degenlabscanner • Fresh Profile Detected*
    `.trim();

    // Foto senden (Icon oder Header bevorzugt)
    const imageUrl = profile.header || profile.icon;
    if (imageUrl) {
        await bot.sendPhoto(chatId, imageUrl, {
            caption: message,
            parse_mode: "Markdown",
            disable_web_page_preview: true
        });
    } else {
        await bot.sendMessage(chatId, message, {
            parse_mode: "Markdown",
            disable_web_page_preview: true
        });
    }
}

async function scan() {
    console.log(`🔍 Scanning new Solana token profiles... (${new Date().toLocaleTimeString()})`);

    const [recent, latest] = await Promise.all([getRecentProfiles(), getLatestProfiles()]);
    const allProfiles = [...recent, ...latest];

    for (const profile of allProfiles) {
        if (profile.chainId !== "solana") continue;
        if (seen.has(profile.tokenAddress)) continue;

        seen.add(profile.tokenAddress);

        const [pairData, bird] = await Promise.all([
            getTokenPairs(profile.tokenAddress),
            getBirdeye(profile.tokenAddress)
        ]);

        if (!pairData) continue;

        await sendEpicPost(profile, pairData, bird);
        console.log(`✅ Gesendet: ${profile.tokenAddress} — ${pairData.baseToken?.symbol || ''}`);
    }
}

console.log("🚀 Degenlabscanner v2 gestartet – sucht nach neuen Token Profiles + Pairs...");
scan();
setInterval(scan, interval);
