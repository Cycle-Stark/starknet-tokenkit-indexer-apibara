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

The following npm scripts are available:

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

## Adding New Networks or Indexers

To add a new network or indexer type:

1. Add the appropriate environment variables to your `.env` file
2. Add a new preset in `apibara.config.ts`
3. Add a new script in `package.json`

### Reference

[Cloover indexer example](https://github.com/Cloover-xyz/indexer)