import type {
    Config,
    NetworkOptions,
    SinkOptions,
} from "@apibara/indexer";

// @ts-ignore
import { BigNumber } from "https://esm.sh/bignumber.js";;
// @ts-ignore
import { CairoUint256, hash } from "https://esm.sh/starknet";

export const config: Config<NetworkOptions, SinkOptions> = {
    //@ts-ignore
    streamUrl: String(Deno.env.get("STREAM_URL")),
    //@ts-ignore
    startingBlock: Number(Deno.env.get("STARTING_BLOCK")),
    network: "starknet",
    finality: "DATA_STATUS_ACCEPTED",
    filter: {
        // header: {},
        // transactions: [{

        // }],
        events: [
            {
                // @ts-ignore
                fromAddress: String(Deno.env.get("CONTRACT_ADDRESS")),
                // keys: ["0x1ec73f457d5ea9957cf98ef7a1ffb4dd5b1c790f320dc3053b51da56260e810", "0x1608c5080aaf56c7102121dc40acaf6e8442e34861df275b0a13d766200af97"], // NewTokenCreated Event
                keys: [],
                includeReceipt: false,
                includeTransaction: false,
                includeReverted: false,
                data: []
            },
        ]
    },
    sinkType: "webhook",
    sinkOptions: {
         // @ts-ignore
        targetUrl: String(Deno.env.get("WEBHOOK_ENDPOINT")),
        // raw: true
    },
};

function converUint256ToNum(low: string, high: string) {
    let uint = new CairoUint256({
        low,
        high
    })
    let id = BigNumber(uint.toBigInt()).toNumber()
    return id
}


function removeLeadingZeros(hexString: string): string {
    // Check if the input starts with '0x' and remove leading zeros after '0x'
    const normalizedString = hexString.toLowerCase().replace(/^0x0+/, '0x');
    return normalizedString;
}

export default function transform(block: any) {
    let events: any[] = block.events
    let tokenCreatedEventSelector = hash.getSelectorFromName("TokenCreated")
    let tokenUpgradedEventSelector = hash.getSelectorFromName("TokenUpgraded")
    let cleanedEvents: any[] = []

    events.forEach((ev: any) => {

        let transferEventData = (ev?.event?.keys ?? []).concat(ev?.event?.data ?? [])
        if (transferEventData?.length === 3
            &&
            (
                removeLeadingZeros(transferEventData[0]) === removeLeadingZeros(tokenCreatedEventSelector)
                ||
                removeLeadingZeros(transferEventData[0]) === removeLeadingZeros(tokenUpgradedEventSelector)
            )
        ) {
            const eventInfo = {
                tokenId: converUint256ToNum(ev.event.keys[1], ev.event.keys[2])
            }
            cleanedEvents.push(eventInfo)
        }
    })

    return cleanedEvents
}
