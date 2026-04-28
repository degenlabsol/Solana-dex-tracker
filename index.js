require('dotenv').config();
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');

// --- Configuration ---
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SCAN_INTERVAL = parseInt(process.env.SCAN_INTERVAL_MS) || 15000;
const POST_COOLDOWN = parseInt(process.env.POST_COOLDOWN_MS) || 8000;
const MIN_LIQUIDITY = parseInt(process.env.MIN_LIQUIDITY) || 3000;
const MAX_MARKETCAP = parseInt(process.env.MAX_MARKETCAP) || 500000;
const MIN_HOLDERS = parseInt(process.env.MIN_HOLDERS) || 0;
const SVS_API_KEY = process.env.SVS_API_KEY || '';
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY || '';

if (!BOT_TOKEN || !CHAT_ID) {
    console.error('❌ MISSING ENV VARIABLES! Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.');
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: false });
const seen = new Set();
let lastPostTime = 0;

function rememberSeen(addr) {
    seen.add(addr);
    if (seen.size > 5000) {
        const first = seen.values().next().value;
        seen.delete(first);
    }
}

function fmt(num) {
    if (num === null || num === undefined || num === 'N/A' || isNaN(Number(num))) return 'N/A';
    const n = Number(num);
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    if (n >= 1) return n.toFixed(2);
    if (n > 0) return n.toPrecision(4);
    return '0';
}

function pct(num) {
    if (num === null || num === undefined || isNaN(Number(num))) return 'N/A';
    const n = Number(num);
    const sign = n > 0 ? '+' : '';
    return `${sign}${n.toFixed(2)}%`;
}

function shortAddr(a) {
    return a ? `${a.slice(0, 4)}...${a.slice(-4)}` : '';
}

function ageFromMs(ms) {
    if (!ms) return 'N/A';
    const diff = Date.now() - ms;
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
}

function escapeMd(text) {
    return text ? String(text).replace(/([_*`\[\]])/g, '\\$1') : '';
}

// --- API Calls ---
async function safeFetch(url, opts = {}, timeoutMs = 10000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...opts, signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        clearTimeout(t);
        return null;
    }
}

async function dsLatestProfiles() {
    const data = await safeFetch('https://api.dexscreener.com/token-profiles/latest/v1');
    return Array.isArray(data) ? data : (data ? [data] : []);
}

async function dsLatestBoosts() {
    const data = await safeFetch('https://api.dexscreener.com/token-boosts/latest/v1');
    return Array.isArray(data) ? data : (data ? [data] : []);
}

async function dsTopBoosts() {
    const data = await safeFetch('https://api.dexscreener.com/token-boosts/top/v1');
    return Array.isArray(data) ? data : (data ? [data] : []);
}

async function dsTokenPairs(tokenAddress) {
    const json = await safeFetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
    if (!json || !json.pairs || json.pairs.length === 0) return null;
    const sol = json.pairs.filter(p => p.chainId === 'solana');
    if (sol.length === 0) return null;
    sol.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
    return sol[0];
}

async function gtToken(tokenAddress) {
    const json = await safeFetch(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${tokenAddress}`, { headers: { 'accept': 'application/json' } });
    return json?.data?.attributes || null;
}

async function gtTokenInfo(tokenAddress) {
    const json = await safeFetch(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${tokenAddress}/info`, { headers: { 'accept': 'application/json' } });
    return json?.data?.attributes || null;
}

async function svsPrice(tokenAddress) {
    if (!SVS_API_KEY) return null;
    const json = await safeFetch(`https://api.solanavibestation.com/v1/token/price?address=${tokenAddress}`, { headers: { 'x-api-key': SVS_API_KEY, 'accept': 'application/json' } });
    return json?.data || json || null;
}

function buildAudit(pair, gtInfo) {
    const flags = [];
    let score = 0, max = 0;

    max++;
    if (pair?.boosts?.active > 0 || pair?.labels?.includes('dex-paid')) { flags.push('✅ DEX [PAID]'); score++; }

    max++;
    const liq = pair?.liquidity?.usd || 0;
    if (liq >= 10000) { flags.push('✅ Liquidity OK'); score++; }
    else if (liq > 0) flags.push(`⚠️ Low Liquidity ($${fmt(liq)})`);

    if (gtInfo && gtInfo.gt_score !== undefined) {
        max++;
        if (gtInfo.gt_score >= 50) { flags.push(`✅ GT Score ${Math.round(gtInfo.gt_score)}`); score++; }
        else flags.push(`⚠️ GT Score ${Math.round(gtInfo.gt_score)}`);
    }

    let emoji = '🟧🟧';
    if (max > 0) {
        const ratio = score / max;
        if (ratio >= 0.8) emoji = '🟩🟩🟩';
        else if (ratio >= 0.5) emoji = '🟨🟨';
        else emoji = '🟧🟥';
    }
    return { flags, emoji };
}

function buildMessage({ profile, pair, gt, gtInfo, svs }) {
    const tokenAddress = profile.tokenAddress;
    const base = pair?.baseToken || {};
    const name = escapeMd(base.name || gt?.name || profile.name || 'Unknown');
    const symbol = escapeMd(base.symbol || gt?.symbol || 'N/A');

    const price = pair?.priceUsd || gt?.price_usd || svs?.price || 0;
    const mc = pair?.marketCap || pair?.fdv || gt?.fdv_usd || gt?.market_cap_usd || 0;
    const ath = gt?.ath_price_usd ? Number(gt.ath_price_usd) * (Number(pair?.fdv) / Number(price || 1)) : null;
    const liq = pair?.liquidity?.usd || (gt && gt.total_reserve_in_usd) || 0;
    const vol24 = pair?.volume?.h24 || gt?.volume_usd?.h24 || 0;
    const vol1h = pair?.volume?.h1 || 0;

    const ch5m = pair?.priceChange?.m5;
    const ch1h = pair?.priceChange?.h1;
    const ch6h = pair?.priceChange?.h6;
    const ch24h = pair?.priceChange?.h24;

    const buys1h = pair?.txns?.h1?.buys ?? 0;
    const sells1h = pair?.txns?.h1?.sells ?? 0;
    const buys24h = pair?.txns?.h24?.buys ?? 0;
    const sells24h = pair?.txns?.h24?.sells ?? 0;

    const holders = gt?.holders?.count || gtInfo?.holders?.count || 'N/A';
    const top10 = gtInfo?.holders?.distribution_percentage?.top_10 || gt?.holders?.distribution_percentage?.top_10 || null;

    const age = pair?.pairCreatedAt ? ageFromMs(pair.pairCreatedAt) : 'N/A';
    const poolAddr = pair?.pairAddress || gt?.address || '';

    const socials = {};
    if (pair?.info?.socials) {
        for (const s of pair.info.socials) {
            if (s.type === 'twitter' || s.url?.includes('x.com')) socials.x = s.url;
            else if (s.type === 'telegram' || s.url?.includes('t.me')) socials.tg = s.url;
            else if (s.type === 'discord') socials.dc = s.url;
        }
    }
    if (pair?.info?.websites?.length > 0) socials.web = pair.info.websites[0].url;
    if (gtInfo?.twitter_handle && !socials.x) socials.x = `https://x.com/${gtInfo.twitter_handle}`;
    if (gtInfo?.telegram_handle && !socials.tg) socials.tg = `https://t.me/${gtInfo.telegram_handle}`;

    const audit = buildAudit(pair, gtInfo);

    let m = `🚀 *${name}* ($${symbol}) ${profile.totalAmount ? `🟣💊` : ''}\n`;
    m += `🌱 Age: ${age}   👀 Boosts: ${profile.totalAmount || profile.amount || 0}\n\n`;

    m += `📊 *Token Stats*\n`;
    m += `➰ MC:   $${fmt(mc)}\n`;
    if (ath && ath > 0) m += `➰ ATH:  $${fmt(ath)}\n`;
    m += `➰ USD:  $${fmt(price)}${ch5m !== undefined ? ` (${pct(ch5m)} 5m)` : ''}\n`;
    m += `➰ LIQ:  $${fmt(liq)}\n`;
    m += `➰ VOL:  $${fmt(vol24)} (24h)${vol1h ? ` | $${fmt(vol1h)} (1h)` : ''}\n`;

    m += `\n📈 *Price Change*\n`;
    m += `➰ 5M:  ${pct(ch5m)} | 1H: ${pct(ch1h)} | 24H: ${pct(ch24h)}\n`;

    m += `\n📉 *Trades*\n`;
    m += `➰ 1H:  B ${buys1h} / S ${sells1h}\n`;
    m += `➰ 24H: B ${buys24h} / S ${sells24h}\n`;

    m += `\n👥 *Holders*\n`;
    m += `➰ HLD: ${holders} ${top10 ? `| Top 10: ${Number(top10).toFixed(2)}%` : ''}\n`;

    m += `\n📍 *Addresses*\n`;
    m += `➰ Token: \`${tokenAddress}\`\n`;

    const socialLinks = [];
    if (socials.tg) socialLinks.push(`[TG](${socials.tg})`);
    if (socials.x) socialLinks.push(`[𝕏](${socials.x})`);
    if (socials.web) socialLinks.push(`[Web](${socials.web})`);
    if (socialLinks.length > 0) m += `\n🔗 *Socials*\n${socialLinks.join(' • ')}\n`;

    m += `\n⚠️ *Audit* ${audit.emoji}\n`;
    m += audit.flags.length > 0 ? audit.flags.join('\n') + '\n' : `_No Audit Data_\n`;

    m += `\n📊 *Charts*\n`;
    m += `[DEX](https://dexscreener.com/solana/${tokenAddress}) • [BIRD](https://birdeye.so/token/${tokenAddress}?chain=solana)\n`;

    m += `\n🤖 *Trade*\n`;
    m += `[Photon](https://photon-sol.tinyastro.io/en/r/@/${tokenAddress}) • [BullX](https://bullx.io/terminal?chainId=1399811149&address=${tokenAddress})\n`;

    const desc = profile.description || gtInfo?.description;
    if (desc) m += `\n📝 _${escapeMd(desc.length > 200 ? desc.slice(0, 200) + '…' : desc)}_\n`;

    return m;
}

async function sendPost(profile, pair, gt, gtInfo, svs) {
    const now = Date.now();
    if (now - lastPostTime < POST_COOLDOWN) return false;

    const message = buildMessage({ profile, pair, gt, gtInfo, svs });
    const imageUrl = profile.header || profile.icon || pair?.info?.imageUrl || gtInfo?.image_url;

    try {
        if (imageUrl) {
            await bot.sendPhoto(CHAT_ID, imageUrl, { caption: message, parse_mode: 'Markdown', disable_web_page_preview: true });
        } else {
            await bot.sendMessage(CHAT_ID, message, { parse_mode: 'Markdown', disable_web_page_preview: true });
        }
        lastPostTime = now;
        return true;
    } catch (e) {
        console.error('❌ Send error:', e.message);
        return false;
    }
}

async function scan() {
    console.log(`🔍 Scan @ ${new Date().toLocaleTimeString()}`);
    const [profiles, boosts, top] = await Promise.all([dsLatestProfiles(), dsLatestBoosts(), dsTopBoosts()]);

    const map = new Map();
    for (const item of [...profiles, ...boosts, ...top]) {
        if (item?.chainId === 'solana' && item.tokenAddress && !map.has(item.tokenAddress)) {
            map.set(item.tokenAddress, item);
        }
    }

    let posted = 0;
    for (const item of map.values()) {
        if (seen.has(item.tokenAddress)) continue;

        const pair = await dsTokenPairs(item.tokenAddress);
        if (!pair) continue;

        const liq = pair.liquidity?.usd || 0;
        const mc = pair.marketCap || pair.fdv || 0;
        if (liq < MIN_LIQUIDITY || (MAX_MARKETCAP > 0 && mc > MAX_MARKETCAP)) continue;

        const [gt, gtInfo, svs] = await Promise.all([gtToken(item.tokenAddress), gtTokenInfo(item.tokenAddress), svsPrice(item.tokenAddress)]);
        rememberSeen(item.tokenAddress);

        if (await sendPost(item, pair, gt, gtInfo, svs)) {
            posted++;
            console.log(`✅ Posted ${item.tokenAddress}`);
            await new Promise(r => setTimeout(r, 2000));
            if (posted >= 2) break;
        }
    }
}

console.log('🚀 DEX Tracker Bot started');
scan().catch(e => console.error('Scan Error:', e.message));
setInterval(() => scan().catch(e => console.error('Scan Error:', e.message)), SCAN_INTERVAL);