import type {
    Config,
    NetworkOptions,
    SinkOptions,
} from "@apibara/indexer";
// import { hash, uint256 } from "https://esm.run/starknet@5.14";

// START FROM 251638

export const config: Config<NetworkOptions, SinkOptions> = {
    streamUrl: "https://sepolia.starknet.a5a.ch",
    startingBlock: 251638,
    network: "starknet",
    finality: "DATA_STATUS_ACCEPTED",
    filter: {
        // header: {},
        // transactions: [{

        // }],
        events: [
            {
                keys: ["0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9"],
                // keys: [hash.getSelectorFromName("Transfer")],
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
        targetUrl: "http://sepolia.localhost:8000/api/receive-rawdata/",
        raw: true
    },
};


export default function transform(block: any) {
    // console.log(block)
    return block
}
