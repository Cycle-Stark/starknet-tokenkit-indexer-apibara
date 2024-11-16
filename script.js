import { BigNumber } from "bignumber.js"
import { CairoUint256, hash, num, shortString, uint256 } from "starknet"

function bigintToShortStr(bigintstr) {
    if (!bigintstr) return ""
    const bn = BigNumber(bigintstr)
    const hex_sentence = bigintstr;
    // const hex_sentence = `0x` + bn.toString(16)

    return shortString.decodeShortString(hex_sentence)
}

function makeEventNameHash() {
    // const nameHash = num.toHex(hash.starknetKeccak('NewTokenCreated'));
    // const nameHash1 = num.toHex(hash.starknetKeccak('NewTokenCreated'));
    const nameHash = hash.getSelectorFromName("TokenCreated")
    const nameHash1 = hash.getSelectorFromName("TokenUpgraded")
    console.log("Event name:  _", nameHash, nameHash1)
}

function converUint256ToNum() {
    let uint = new CairoUint256({
        low: "0x0000000000000000000000000000000000000000000000000000000001b5da00",
        high: "0x0000000000000000000000000000000000000000000000000000000000000000"
    })
    let id = BigNumber(uint.toBigInt()).toNumber()
    console.log("ID __ ", id)
}

function convertToReadableTokens(){
    let value = BigNumber(3688670329052).dividedBy(10 ** 18).toString()
    console.log("My readable value is: ", value)
}

const eventName = bigintToShortStr("0x3ba972537cb2f8e811809bba7623a2119f4f1133ac9e955a53d5a605af72bf2")
// console.log("Event Name: ", eventName)
// makeEventNameHash()
// makeEventNameHash()
// makeEventNameHash()

converUint256ToNum()
convertToReadableTokens()


