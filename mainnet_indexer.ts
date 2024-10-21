import type {
    Config,
    NetworkOptions,
    SinkOptions,
} from "@apibara/indexer";

// START FROM 820000

export const config: Config<NetworkOptions, SinkOptions> = {
    streamUrl: "https://mainnet.starknet.a5a.ch",
    startingBlock: 82000,
    network: "starknet",
    finality: "DATA_STATUS_ACCEPTED",
    filter: {
        // header: {},
        // transactions: [{

        // }],
        events: [
            {
                keys: ["0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9"],
                includeReceipt: false,
                includeTransaction: false,
                includeReverted: false,
                data: []
            },
        ]
    },
    sinkType: "webhook",
    // sinkType: "console",
    sinkOptions: {
        targetUrl: "http://mainnet.localhost:8000/api/receive-rawdata/",
        raw: true
    },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export default function transform(block: any) {
    // console.log(block)
    // sleep(200)
    return block
}
