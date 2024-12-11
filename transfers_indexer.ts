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
    startingBlock: Number(Deno.env.get("STARTING_BLOCK")),
    network: "starknet",
    finality: "DATA_STATUS_ACCEPTED",
    maxMessageSize: '400MB',
    filter: {
        header: {},
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

    return BigNumber(uint.toBigInt()).toString()
}


// For checking whether two addresses match, it best we remove the traling zeros after `0x` and then set it to lowercase
function removeLeadingZeros(hexString: string): string {
    // Check if the input starts with '0x' and remove leading zeros after '0x'
    const normalizedString = hexString.toLowerCase().replace(/^0x0+/, '0x');
    return normalizedString;
}

// If we want to slow the indexer, we can introduce this function in the `transfrom` function
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// export default function transform(block: any) {

//     // let events: any[] = block.events
//     let transferEventSelector = hash.getSelectorFromName("Transfer")
//     let transactions: any[] = []
//     let timestamp = block?.header?.timestamp
// events?.forEach((ev: any) => {
// for (const ev of block.events) {

/* 
    Join the two arrays together that is the keys array and Data array. 
    The lenght of the resulting array should be 5 since;
    1st Item - Is the Event selector
    2nd Item - From Address
    3rd Item - To Address
    4th Item - Uint256 low
    5th Item - Uint256 high
 */

// console.log("Event: ", ev)
// sleep(10000)
// if (1 === 1) {
//     return
// }

// let transferEventData = (ev?.event?.keys ?? []).concat(ev?.event?.data ?? [])
// if (transferEventData?.length === 5 && removeLeadingZeros(transferEventData[0]) === removeLeadingZeros(transferEventSelector)) {
//     transactions.push({
//         token: ev.event.fromAddress,
//         from: transferEventData[1],
//         to: transferEventData[2],
//         value: converUint256ToNum(transferEventData[3], transferEventData[4]),
//         txhash: ev?.receipt?.transactionHash ?? "-",
//         timestamp: timestamp,
//     })
// }
// }


//     for (const ev of block.events) {
//         const keys = ev?.event?.keys ?? [];
//         const data = ev?.event?.data ?? [];

//         // Check if we have the correct number of keys/data
//         if (keys.length + data.length === 5 && 
//             removeLeadingZeros(keys[0]) === removeLeadingZeros(transferEventSelector)) {

//             transactions.push({
//                 token: ev.event.fromAddress,
//                 from: keys[1],
//                 to: keys[2],
//                 value: converUint256ToNum(data[3], data[4]),
//                 txhash: ev?.receipt?.transactionHash ?? "-",
//                 timestamp: timestamp,
//             });
//         }
//     }

//     return transactions;
// }

interface IReceipt {
    transactionHash: any
}

interface IEvent {
    event: any
    receipt: IReceipt
}


export default function transform(block: any) {
    const transferEventSelector = hash.getSelectorFromName("Transfer");
    const transactions: Array<{ token: string; from: string; to: string; value: number; txhash: string; timestamp: number }> = [];
    const timestamp = block?.header?.timestamp;

    if (block.events) {

        for (const ev of block.events) {
            // const keys = ev?.event?.keys ?? [];
            // const data = ev?.event?.data ?? [];

            // Check if we have the correct number of keys/data
            let transferEventData = [...(ev?.event?.keys ?? []), ...(ev?.event?.data ?? [])]
            if (transferEventData.length === 5 &&
                removeLeadingZeros(transferEventData[0]) === removeLeadingZeros(transferEventSelector)) {

                transactions.push({
                    token: ev.event.fromAddress,
                    from: transferEventData[1],
                    to: transferEventData[2],
                    value: converUint256ToNum(transferEventData[3], transferEventData[4]),
                    txhash: ev?.receipt?.transactionHash ?? "-",
                    timestamp: timestamp,
                });
            }
        }

        return transactions;
    }
    return []
}