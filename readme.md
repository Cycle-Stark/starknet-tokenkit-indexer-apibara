# Starknet Tokenkit Indexer

This is the indexing code for starknet events

Head over to [Apibara](https://app.apibara.com/) and create an account. Generate the `dna` key for your purpose

## How to run for both Mainnet and Sepolia

Complete run script for mainnet and sepolia

### Mainnet

```bash
apibara run mainnet_indexer.ts -A dna_XXXXXXXXX --persist-to-redis redis://localhost:6379 --sink-id tokenkit_mainnet3
```

### Sepolia

```bash
apibara run sepolia_indexer.ts -A dna_XXXXXXXXX --persist-to-redis redis://localhost:6379 --sink-id tokenkit_sepolia3
```

