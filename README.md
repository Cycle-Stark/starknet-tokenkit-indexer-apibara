# Tokenkit Indexer

## Environment Setup

The project now uses a single `.env` file with combined environment variables for all networks and indexers. Follow these steps to set up your environment:

1. Copy the `.env.example` file to create your own `.env` file:

```bash
cp .env.example .env
```

2. Edit the `.env` file to customize any values as needed.

## Configuration Structure

The Apibara configuration has been updated to use a preset-based approach:

- Each combination of network (mainnet/sepolia) and indexer type (tokenkit/transfers) has its own preset
- Environment variables are prefixed with the indexer type and network (e.g., `TOKENKIT_MAINNET_*`)
- Common settings like `PERSIST_TO_REDIS` are shared across all presets

## Available Scripts

### Development

The following yarn scripts are available for development:

```bash
# Run the tokenkit indexer on mainnet
yarn tokenkit:mainnet

# Run the tokenkit indexer on sepolia
yarn tokenkit:sepolia

# Run the transfers indexer on mainnet
yarn transfers:mainnet

# Run the transfers indexer on sepolia
yarn transfers:sepolia
```

### Production (PM2)

For production deployment, use PM2 with the ecosystem config:

```bash
# Install dependencies
yarn install

# Build the project
yarn build

# Start all indexers (mainnet + sepolia)
pm2 start ecosystem.config.cjs

# Start only mainnet indexer
pm2 start ecosystem.config.cjs --only transfers_mainnet

# Start only sepolia indexer
pm2 start ecosystem.config.cjs --only transfers_sepolia

# Stop a specific indexer
pm2 stop ecosystem.config.cjs --only transfers_mainnet

# Restart a specific indexer
pm2 restart ecosystem.config.cjs --only transfers_sepolia

# Stop all indexers
pm2 stop ecosystem.config.cjs

# Delete all indexers from PM2
pm2 delete ecosystem.config.cjs

# View status
pm2 status

# View logs for specific indexer
pm2 logs transfers_mainnet
pm2 logs transfers_sepolia

# View all logs
pm2 logs

# Save PM2 process list (survives reboots)
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

## Adding New Networks or Indexers

To add a new network or indexer type:

1. Add the appropriate environment variables to your `.env` file
2. Add a new preset in `apibara.config.ts`
3. Add a new script in `package.json`

### Reference

[Cloover indexer example](https://github.com/Cloover-xyz/indexer)