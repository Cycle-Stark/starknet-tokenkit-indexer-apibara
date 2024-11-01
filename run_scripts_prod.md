# Running the scripts in production

To run the scripts in production we use `nohup`

```shell
nohup apibara run --allow-env=/home/starknet_indexer/.env /home/starknet_indexer/mainnet_indexer.ts -A dna_9PRiUYPdKJcwLybf5cXm --persist-to-redis redis://localhost:6379 --sink-id starknet_mainnet &
```

```shell
nohup apibara run --allow-env=/home/starknet_indexer/.env /home/starknet_indexer/sepolia_indexer.ts -A dna_9PRiUYPdKJcwLybf5cXm --persist-to-redis redis://localhost:6379 --sink-id starknet_sepolia &
```

## Stopping the scripts


1. Identify the specific port

```shell
ps aux | grep "apibara some-key somefile.ts"
```

2. Kill the port

```shell
kill <PID>
```

or to force kill

```shell
kill -9 <PID>
```

## Restarting.

To restart use the same script as starting script