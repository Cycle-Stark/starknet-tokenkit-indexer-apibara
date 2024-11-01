# Starknet Tokenkit Indexer

This is the indexing code for starknet events

## Requirements

1. You will need an indexing key from Apibara - Head over to [Apibara](https://app.apibara.com/) and create an account. Generate the `dna` key and use it below.
2. Backend setup - To setup your backend, check the `Tokenkit Indexer Backend` Repo to do the setup


## How to run for both Mainnet and Sepolia

Complete run script for mainnet and sepolia

Install the sink webhook plugin

```shel
apibara plugins install sink-webhook
```

### Mainnet

```bash
apibara run --allow-env=.env mainnet_indexer.ts -A dna_9xxx --persist-to-redis redis://localhost:6379 --sink-id tokenkit_mainnet3
```

### Sepolia

```bash
apibara run --allow-env=.env sepolia_indexer.ts -A dna_9xxx --persist-to-redis redis://localhost:6379 --sink-id tokenkit_sepolia3
```


Encrypt .env:
Attention: leave no blank lines in the .env, otherwise it leads to problems at decryption!
```shell
sops --encrypt --age '<public-key>' .prod.env > secret.env
```
Decrypt secret.env:
To decrypt the secret.env store the keys.txt file at \root\.config\sops, which is the default directory sops is looking for the private key.

Add encryption key to sop keys

```shell
mkdir -p ~/.config/sops/age
echo 'AGE_PRIVATE_KEY' > ~/.config/sops/age/keys.txt
```

Run the decryption command

```shell
sops --decrypt secret.env > .env1
```