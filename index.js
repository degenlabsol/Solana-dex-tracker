require('dotenv').config();
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const chatId = process.env.TELEGRAM_CHAT_ID;
const scanInterval = 15000;        // 15 Sekunden – 1 Post max pro Intervall
const postCooldown = 15000;        // Mindestabstand zwischen Posts

if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.error("❌ FEHLENDE ENV-VARIABLEN!");
    process.exit(1);
}

const seen = new Set();
let lastPostTime = 0;

const BIRDEYE_API = "https://public-api.birdeye.so/defi/price";
const HEADERS = { "accept": "application/json", "x-chain": "solana" };

function format(num) {
    if (!num) return "0";
    if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
    if (num >= 1e6) return (num / 1e6).toFixed(1) + "M";
    if (num >= 1e3) return (num / 1e3).toFixed(1) + "K";
    return Number(num).toFixed(4);
}

async function getLatestProfiles() {
    try {
        const res = await fetch("https://api.dexscreener.com/token-profiles/latest/v1");
        let data = await res.json();
        return Array.isArray(data) ? data : [data].filter(Boolean);
    } catch { return []; }
}

async function getLatestBoosts() {
    try {
        const res = await fetch("https://api.dexscreener.com/token-boosts/latest/v1");
        let data = await res.json();
        return Array.isArray(data) ? data : [data].filter(Boolean);
    } catch { return []; }
}

async function getTokenPairs(tokenAddress) {
    try {
        const res = await fetch(`https://api.dexscreener.com/token-pairs/v1/solana/${tokenAddress}`);
        const json = await res.json();
        return Array.isArray(json) ? json[0] : json;
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
    const now = Date.now();
    if (now - lastPostTime < postCooldown) return false; // Cooldown

    const name = pairData?.baseToken?.name || "Unknown";
    const symbol = pairData?.baseToken?.symbol || "???";
    const tokenAddr = profile.tokenAddress || pairData?.baseToken?.address;

    const price = bird?.value || pairData?.priceUsd || 0;
    const mc = pairData?.marketCap || pairData?.fdv || 0;
    const liquidity = bird?.liquidity || pairData?.liquidity?.usd || 0;
    const vol24 = pairData?.volume?.h24 || 0;

    const change24h = bird?.priceChange24h || pairData?.priceChange?.h24 || 0;
    const dexUrl = pairData?.url || `https://dexscreener.com/solana/${tokenAddr}`;

    const description = profile.description 
        ? profile.description.substring(0, 180) + "..." 
        : "No description yet.";

    let linksText = "";
    if (profile.links && profile.links.length) {
        linksText = "\n🔗 *Links:*\n" + profile.links.map(l => `• [${l.label || l.type}](${l.url})`).join("\n");
    }

    const message = `
🚀 *${name}* ($${symbol}) — **New Profile / Boost**

📍 \`${tokenAddr}\`

💰 Price: $${parseFloat(price).toFixed(6)}
📊 MC: $${format(mc)}
💧 Liquidity: $${format(liquidity)}
📈 24h Vol: $${format(vol24)}
📉 24h: ${change24h >= 0 ? '🟢 +' : '🔴 '}${change24h.toFixed(1)}%

📝 *Description*
${description}

${linksText}

🌐 **[DEX Screener →](${dexUrl})**

⚡ *Degenlabscanner • Fresh Signal*
    `.trim();

    const imageUrl = profile.header || profile.icon || pairData?.info?.imageUrl;
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

    lastPostTime = now;
    return true;
}

async function scan() {
    console.log(`🔍 Scan started (${new Date().toLocaleTimeString()})`);

    const [profiles, boosts] = await Promise.all([
        getLatestProfiles(),
        getLatestBoosts()
    ]);

    const candidates = [...profiles, ...boosts];

    for (const item of candidates) {
        if (item.chainId !== "solana") continue;
        if (seen.has(item.tokenAddress)) continue;

        // Qualitätsfilter: nur interessante Early-Stage Tokens
        const pairData = await getTokenPairs(item.tokenAddress);
        if (!pairData) continue;

        const liquidity = pairData.liquidity?.usd || 0;
        const mc = pairData.marketCap || pairData.fdv || 0;

        if (liquidity < 3000 || mc > 300000) continue; // anpassbar

        seen.add(item.tokenAddress);

        const bird = await getBirdeye(item.tokenAddress);

        const posted = await sendEpicPost(item, pairData, bird);
        if (posted) {
            console.log(`✅ Gepostet: ${item.tokenAddress} (${pairData.baseToken?.symbol})`);
            // Nach einem Post kurz warten – verhindert Spam
            await new Promise(r => setTimeout(r, 3000));
            break; // nur 1 pro Scan-Runde
        }
    }
}

console.log("🚀 Degenlabscanner v3 gestartet – ruhiger Modus mit Qualitätsfilter");
scan();
setInterval(scan, scanInterval);
