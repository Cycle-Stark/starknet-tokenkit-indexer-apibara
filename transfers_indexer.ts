import type {
    Config,
    NetworkOptions,
    SinkOptions,
} from "@apibara/indexer";

// @ts-ignore
import { BigNumber } from "https://esm.sh/bignumber.js";;
// @ts-ignore
import { CairoUint256, hash } from "https://esm.sh/starknet";

// START FROM 820213

export const config: Config<NetworkOptions, SinkOptions> = {
    //@ts-ignore
    streamUrl: String(Deno.env.get("STREAM_URL")),
    //@ts-ignore
    startingBlock: String(Deno.env.get("STARTING_BLOCK")),
    network: "starknet",
    finality: "DATA_STATUS_ACCEPTED",
    filter: {
        header: {},
        events: [
            {
                keys: ["0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9"],
                includeReceipt: true,
                includeTransaction: false,
                includeReverted: false,
                data: []
            },
        ]
    },
    sinkType: "webhook",
    // sinkType: "console",
    sinkOptions: {
        // @ts-ignore
        targetUrl: String(Deno.env.get("WEBHOOK_ENDPOINT")),
        // raw: true
    },
};


// Helper function to help convert a uint256 to a normal number using BignumberJs
function converUint256ToNum(low: string, high: string) {
    let uint = new CairoUint256({
        low,
        high
    })
    let id = BigNumber(uint.toBigInt()).toString()
    return id
}


// For checking whether two addresses match, it best we remove the traling zeros after `0x` and then set it to lowercase
function removeLeadingZeros(hexString: string): string {
    // Check if the input starts with '0x' and remove leading zeros after '0x'
    const normalizedString = hexString.toLowerCase().replace(/^0x0+/, '0x');
    return normalizedString;
}

// If we want to slow the indexer, we can introduce this function in the `transfrom` function
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function transform(block: any) {
    let events: any[] = block.events
    let transferEventSelector = hash.getSelectorFromName("Transfer")
    let transactions: any[] = []

    events.forEach((ev: any) => {

        /* 
            Join the two arrays together that is the keys array and Data array. 
            The lenght of the resulting array should be 5 since;
            1st Item - Is the Event selector
            2nd Item - From Address
            3rd Item - To Address
            4th Item - Uint256 low
            5th Item - Uint256 high
         */

        let transferEventData = (ev?.event?.keys ?? []).concat(ev?.event?.data ?? [])
        if (transferEventData?.length === 5 && removeLeadingZeros(transferEventData[0]) === removeLeadingZeros(transferEventSelector)) {
            const transferInfo = {
                token: ev.event.fromAddress,
                from: transferEventData[1],
                to: transferEventData[2],
                value: converUint256ToNum(transferEventData[3], transferEventData[4]),
                txhash: ev?.receipt?.transactionHash ?? "-",
                timestamp: block?.header?.timestamp,
            }
            transactions.push(transferInfo)
        }
    })
    // sleep(1000)
    return transactions;
}
