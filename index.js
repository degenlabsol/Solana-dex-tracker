require('dotenv').config();
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// Konfiguration
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const chatId = process.env.TELEGRAM_CHAT_ID;
const scanInterval = parseInt(process.env.SCAN_INTERVAL_MS) || 15000; // 15 Sekunden Standard
const postCooldown = 15000; // Mindestabstand zwischen Posts

if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.error("❌ FEHLENDE ENV-VARIABLEN!");
    process.exit(1);
}

const seen = new Set();
let lastPostTime = 0;

// Railway.app Server Setup
const PORT = process.env.PORT || 3000;
const app = express();

app.get('/', (req, res) => {
    res.send('Solana DEX Tracker Bot is running');
});

app.listen(PORT, () => {
    console.log(`Bot server running on port ${PORT}`);
});

// API-Konfigurationen
const BIRDEYE_API = "https://public-api.birdeye.so/defi/price";
const HEADERS = { "accept": "application/json", "x-chain": "solana" };

// Formatierungsfunktion
function format(num) {
    if (!num) return "0";
    if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
    if (num >= 1e6) return (num / 1e6).toFixed(1) + "M";
    if (num >= 1e3) return (num / 1e3).toFixed(1) + "K";
    return Number(num).toFixed(4);
}

// API-Funktionen
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
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
        const json = await res.json();
        return json.pairs && json.pairs.length > 0 ? json.pairs[0] : null;
    } catch { return null; }
}

async function getBirdeye(tokenAddress) {
    try {
        const res = await fetch(`${BIRDEYE_API}?address=${tokenAddress}`, { headers: HEADERS });
        const json = await res.json();
        return json.success ? json.data : null;
    } catch { return null; }
}

// Nachrichtensenden mit Bild
async function sendEpicPost(profile, pairData, bird) {
    const now = Date.now();
    if (now - lastPostTime < postCooldown) {
        console.log("⏳ Cooldown aktiv, warte...");
        return false;
    }

    const tokenAddress = profile.tokenAddress;
    
    // Bild-URL aus verschiedenen Quellen
    const imageUrl = profile.header || profile.icon || pairData?.info?.imageUrl;
    
    // Zusätzliche Informationen sammeln
    const price = pairData?.priceUsd || bird?.value || "N/A";
    const liquidity = pairData?.liquidity?.usd || bird?.liquidity || "N/A";
    const volume24h = pairData?.volume?.h24 || "N/A";
    const priceChange24h = pairData?.priceChange?.h24 || bird?.priceChange24h || "N/A";
    const marketCap = pairData?.fdv || "N/A";
    const url = pairData?.url || `https://dexscreener.com/solana/${tokenAddress}`;
    
    // Nachricht im gewünschten Format erstellen
    let message = `🚀 *Boosted Token Update*\n\n`;
    message += `📍 *Token Address:* \`${tokenAddress}\`\n`;
    message += `💰 *Updated Boost Amount:* ${profile.totalAmount || "N/A"}\n`;
    message += `📝 *Description:* ${profile.description || 'N/A'}\n`;
    message += `🔤 *Name:* ${profile.name || 'N/A'} (${profile.symbol || 'N/A'})\n`;
    message += `💵 *Current Price:* $${format(price)}\n`;
    message += `💹 *Price Change (24h):* ${priceChange24h}%\n`;
    message += `📊 *Volume (24h):* $${format(volume24h)}\n`;
    message += `🔗 *Liquidity:* $${format(liquidity)}\n`;
    message += `💼 *Market Cap:* $${format(marketCap)}\n`;
    message += `\n🔗 [View on DEX Screener](${url})`;
    
    try {
        // Bild senden, falls verfügbar
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
        console.log(`✅ Nachricht gesendet für ${tokenAddress}`);
        return true;
    } catch (error) {
        console.error('❌ Fehler beim Senden:', error.message);
        return false;
    }
}

// Haupt-Scan-Funktion
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

        // Korrigierter Qualitätsfilter mit richtigen Vergleichsoperatoren
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

console.log("🚀 Solana DEX Tracker Bot gestartet – ruhiger Modus mit Qualitätsfilter");
scan();
setInterval(scan, scanInterval);
