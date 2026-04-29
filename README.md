# 🚀 Solana DEX Tracker Bot

A powerful and fully automated Node.js Telegram bot that tracks the newest and hottest Solana tokens and boosts on DexScreener. It aggregates deep insights from multiple APIs and formats them into a beautiful, robust Telegram message.

## ✨ Features

- **Real-Time Scanning:** Automatically fetches the latest token profiles and boosted tokens from DexScreener.
- **Multi-API Data Aggregation:** Pulls rich token metrics using:
  - DexScreener (Liquidity, FDV, Price, Vol)
  - GeckoTerminal (Holders, Top 10 Distribution, ATH, Trust Scores)
  - Birdeye & Solana Vibe Station (Secondary price validation)
- **Robust Telegram Messaging:** Safely escapes Markdown characters. Features a 3-tier fallback system (Image+Markdown ➔ Text+Markdown ➔ Plain Text) so messages *never* fail to send.
- **Anti-Spam & Filters:** Built-in cool-down timers and optional filters for Minimum Liquidity, Maximum Marketcap, and Minimum Holders.
- **One-Click Trading:** Includes direct fast-trading links for popular sniper bots (Photon, BullX, Trojan, Maestro, BananaGun, etc.).

## 📋 Prerequisites

- **Node.js** (v16 or higher)
- A Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
- A Telegram Chat/Channel ID to send the alerts to

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone [https://github.com/yourusername/solana-dex-tracker.git](https://github.com/yourusername/solana-dex-tracker.git)
   cd solana-dex-tracker
