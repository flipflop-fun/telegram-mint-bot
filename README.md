# Flipflop Mint Bot

A powerful Telegram bot for Solana blockchain operations, built with TypeScript and the Flipflop SDK. This bot provides a user-friendly interface for wallet management, token minting, transfers, and various Solana blockchain interactions.

## 🌟 Features

### 💳 Wallet Management
- **Generate Wallets**: Create new Solana wallets (1-100 wallets)
- **My Wallets**: View and manage existing wallets with real-time balance updates
- **Secure Storage**: Encrypted wallet storage with SQLCipher

### 🪙 Token Operations
- **Mint Tokens**: Create new SPL tokens on Solana
- **Token Data**: View detailed token information and metadata
- **SPL Token Management**: Send and receive SPL tokens

### 💸 Transfer Functions
- **Send SOL**: Transfer SOL tokens between wallets
- **Send SPL**: Transfer SPL tokens with support for custom amounts
- **Batch Operations**: Even distribution and single transfer modes

### 🔧 Additional Features
- **Refund Operations**: Process refund transactions
- **URC Info**: Retrieve URC-related data
- **Multi-language Support**: 8 languages (English, Chinese, Spanish, French, Japanese, Russian, Vietnamese)
- **Network Selection**: Switch between Mainnet and Devnet
- **Real-time Updates**: Live balance and transaction status updates

## 🚀 Quick Start

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd telegram_mint_bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Environment Setup**
   
   Create a `.env` file in the root directory:
   ```env
   BOT_TOKEN=your_telegram_bot_token_here
   DB_ENCRYPTION_KEY=your_secure_encryption_key_here
   NETWORK=mainnet
   MAINNET_RPC=https://api.mainnet-beta.solana.com
   DEVNET_RPC=https://api.devnet.solana.com
   DB_FILE=src/data/wallets.db
   ```

4. **Start the bot**
   ```bash
   # Development mode
   npm run dev
   # or
   yarn dev
   
   # Production mode
   npm run build
   npm start
   ```

## 📋 Available Commands

### Development Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run start` - Start production server
- `npm run typecheck` - Run TypeScript type checking

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `BOT_TOKEN` | Telegram Bot Token from BotFather | - | ✅ |
| `DB_ENCRYPTION_KEY` | Database encryption key | `default-encryption-key-change-in-production` | ⚠️ |
| `NETWORK` | Solana network (`mainnet` or `devnet`) | `mainnet` | ❌ |
| `MAINNET_RPC` | Mainnet RPC endpoint | `https://api.mainnet-beta.solana.com` | ❌ |
| `DEVNET_RPC` | Devnet RPC endpoint | `https://api.devnet.solana.com` | ❌ |
| `DB_FILE` | Database file path | `src/data/wallets.db` | ❌ |

### Security Notes

⚠️ **Important**: Change the `DB_ENCRYPTION_KEY` in production to ensure wallet security.

## 🏗️ Project Structure

```
telegram_mint_bot/
├── bot.ts                 # Main bot entry point
├── config.ts             # Configuration and environment variables
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── nodemon.json          # Development server configuration
└── src/
    ├── commands/         # Bot command handlers
    │   ├── generateWallets.ts
    │   ├── myWallets.ts
    │   ├── mint.ts
    │   ├── sendSol.ts
    │   ├── sendSpl.ts
    │   ├── mintData.ts
    │   ├── refund.ts
    │   ├── getUrc.ts
    │   └── help.ts
    ├── i18n/            # Internationalization
    │   ├── i18n.ts
    │   └── locales/     # Translation files
    │       ├── en.json
    │       ├── zh-CN.json
    │       ├── zh-TW.json
    │       ├── es.json
    │       ├── fr.json
    │       ├── ja.json
    │       ├── ru.json
    │       └── vi.json
    ├── services/        # Core services
    │   └── db.ts       # Database operations
    ├── utils/          # Utility functions
    └── scripts/        # Helper scripts
```

## 🌐 Supported Languages

The bot supports 8 languages with full localization:

- 🇺🇸 English (en)
- 🇨🇳 Chinese Simplified (zh-CN)
- 🇹🇼 Chinese Traditional (zh-TW)
- 🇪🇸 Spanish (es)
- 🇫🇷 French (fr)
- 🇯🇵 Japanese (ja)
- 🇷🇺 Russian (ru)
- 🇻🇳 Vietnamese (vi)

## 🔒 Security Features

- **Encrypted Database**: All wallet data is encrypted using SQLCipher
- **Private Key Protection**: Private keys are stored securely and only displayed when requested
- **Network Isolation**: Separate configurations for mainnet and devnet
- **Input Validation**: Comprehensive validation for all user inputs

## 🛠️ Development

### Setting up Development Environment

1. **Install dependencies**
   ```bash
   yarn install
   ```

2. **Start development server**
   ```bash
   yarn dev
   ```

3. **Type checking**
   ```bash
   yarn typecheck
   ```

### Code Structure

- **Commands**: Each bot feature is implemented as a separate command module
- **Services**: Core business logic and database operations
- **Utils**: Shared utility functions and helpers
- **i18n**: Internationalization support with JSON translation files

### Adding New Features

1. Create a new command file in `src/commands/`
2. Register the command in `bot.ts`
3. Add translations to all locale files in `src/i18n/locales/`
4. Update the help text if needed

## 📦 Dependencies

### Core Dependencies
- **@flipflop-sdk/node**: Flipflop SDK for Solana operations
- **@solana/web3.js**: Solana JavaScript SDK
- **@solana/spl-token**: SPL Token operations
- **telegraf**: Telegram Bot API framework
- **better-sqlite3**: SQLite database with encryption support

### Development Dependencies
- **TypeScript**: Type-safe JavaScript
- **nodemon**: Development server with hot reload
- **ts-node**: TypeScript execution environment

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

If you encounter any issues or have questions:

1. Check the [Issues](../../issues) section
2. Create a new issue with detailed information
3. Join our community discussions

## 🔄 Version History

- **v1.1.6**: Current version with multi-language support and enhanced features
- **v1.1.x**: Added internationalization and improved UI
- **v1.0.x**: Initial release with core functionality

---

**⚠️ Disclaimer**: This bot handles cryptocurrency operations. Always test on devnet before using on mainnet. Keep your private keys secure and never share them with anyone.