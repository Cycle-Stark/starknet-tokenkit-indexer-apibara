import { BigNumber } from "bignumber.js"
import { hash, num, shortString } from "starknet"

function bigintToShortStr(bigintstr) {
    if (!bigintstr) return ""
    const bn = BigNumber(bigintstr)
    const hex_sentence = bigintstr;
    // const hex_sentence = `0x` + bn.toString(16)

    return shortString.decodeShortString(hex_sentence)
}

function makeEventNameHash(){
    const nameHash = num.toHex(hash.starknetKeccak('Transfer'));
    const nameHash1 = num.toHex(hash.starknetKeccak('transfer'));
    console.log("Event name:  _", nameHash, nameHash1)
}

const eventName = bigintToShortStr("0x3ba972537cb2f8e811809bba7623a2119f4f1133ac9e955a53d5a605af72bf2")
// console.log("Event Name: ", eventName)
makeEventNameHash()
makeEventNameHash()
makeEventNameHash()


