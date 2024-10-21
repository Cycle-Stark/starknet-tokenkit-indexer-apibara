# Starknet Tokenkit Indexer

This is the indexing code for starknet events

## Requirements

1. You will need an indexing key from Apibara - Head over to [Apibara](https://app.apibara.com/) and create an account. Generate the `dna` key and use it below.
2. Backend setup - To setup your backend, check the `Tokenkit Indexer Backend` Repo to do the setup


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

