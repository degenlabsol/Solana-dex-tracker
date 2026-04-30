# 🚀 Solana DEX Tracker Bot

A powerful, fully automated, and highly optimized Node.js Telegram bot that tracks the newest and hottest Solana tokens and boosts on DexScreener. It aggregates deep insights from multiple APIs, utilizes a smart queuing system to bypass rate limits, and formats data into a beautiful, robust Telegram message.

## ✨ Key Features

- **Real-Time Scanning:** Automatically fetches the latest token profiles and boosted tokens from DexScreener.
- **Asynchronous Post Queue (NEW):** Prevents Telegram rate-limiting and API bans by queuing discovered tokens and posting them safely at defined intervals (e.g., every 5 seconds).
- **Smart Memory & TTL (NEW):** Keeps track of posted tokens to prevent spam. Tokens are released from memory after a 25-minute Time-To-Live (TTL) so they can be posted again if they receive fresh boosts.
- **Multi-API Data Aggregation:** Pulls rich token metrics using:
  - **DexScreener** (Liquidity, FDV, Price, Vol, Age)
  - **GeckoTerminal** (Holders, Top 10 Distribution, ATH, Trust Scores, Image Fallback)
  - **Birdeye & Solana Vibe Station** (Secondary price validation)
- **Robust Telegram Messaging:** Safely escapes Markdown characters. Features a bulletproof 3-tier fallback system (Image+Markdown ➔ Text+Markdown ➔ Plain Text) so messages *never* fail to send.
- **One-Click Trading:** Includes direct fast-trading links for popular sniper bots (Photon, BullX, Trojan, Maestro, BananaGun, etc.).

## 📋 Prerequisites

- **Node.js** (v16 or higher)
- A Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
- A Telegram Chat/Channel ID to send the alerts to (e.g., `-1001234567890`)

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/solana-dex-tracker.git
   cd solana-dex-tracker
   ```

2. **Install dependencies**
   ```bash
   npm install node-fetch node-telegram-bot-api dotenv
   ```

3. **Environment Setup**
   Create a `.env` file in the root directory:
   ```env
   # Required
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
   TELEGRAM_CHAT_ID=-100xxxxxxxxxx
   
   # Bot Timings (in milliseconds)
   SCAN_INTERVAL_MS=12000
   POST_COOLDOWN_MS=5000
   
   # Optional Filters (Set to 0 to disable)
   MIN_LIQUIDITY=0
   MAX_MARKETCAP=0
   MIN_HOLDERS=0
   
   # Optional Secondary APIs
   SVS_API_KEY=
   BIRDEYE_API_KEY=
   ```

## 🚀 Usage

It is highly recommended to run the bot in the background using a process manager like `pm2`.

**Install PM2 (if not already installed):**
```bash
npm install -g pm2
```

**Start the Bot:**
```bash
pm2 start index.js --name DexTracker
pm2 save
```

**View Logs:**
```bash
pm2 logs DexTracker
```

## 📝 Example Output

```text
🚀 TokenName ($TKN) 🟣💊
🌱 Age: 12m   👀 Boosts: 5

📊 Token Stats
➰ MC:   $50.5K
➰ ATH:  $120.2K
➰ USD:  $0.000123 (+15.20% 5m)
➰ LIQ:  $15.2K
➰ VOL:  $240K (24h) | $85K (1h)

📈 Price Change
➰ 5M:  +15.20%
➰ 1H:  +45.00%
➰ 6H:  +120.00%
➰ 24H: +120.00%

📉 Trades
➰ 1H:  B 120 / S 45
➰ 24H: B 340 / S 110

👥 Holders
➰ HLD: 450
➰ Top 10: 22.50%

📍 Addresses
➰ Token: ABCD...WXYZ
➰ Pool:  1234...5678

🔗 Socials
[TG] • [𝕏] • [Web]

⚠️ Audit 🟩🟩🟩
✅ DEX [PAID]
✅ Liquidity OK
✅ GT Score 85

📊 Charts
[DEX] • [GT] • [BIRD] • [SCAN] • [DEF]

🤖 Trading
[Photon] • [BullX] • [GMGN] • [Trojan] • [Maestro] • [Banana]

📝 Official description of the token goes here...
```

## ⚠️ Disclaimer
This script is provided for educational and informational purposes only. Trading meme coins and low-cap crypto tokens carries significant financial risk. Always do your own research (DYOR). The bot developers are not responsible for any financial losses.
