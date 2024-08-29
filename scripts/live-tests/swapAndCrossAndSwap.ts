import hre from "hardhat";
import addresses from "../../constants/addresses_test.json";
import axios from "axios";
import { AbiCoder } from "ethers";

const walletAddress = "0x93069da82B264E94068aA991b88b3478cf0861BE"
const abiCoder = AbiCoder.defaultAbiCoder()
const slippage = 2
const oneInchRouterAddress = "0x111111125421ca6dc452d289314280a0f8842a65"

async function main() {
    const thisNetwork = hre.network.name;
    const currentNetworkInfo = addresses.networks[thisNetwork];
    const dstNetworkInfo = addresses.networks["base"];
    const fiberRouterAddress = currentNetworkInfo.deployments.fiberRouter;
    const dstFiberRouterAddress = dstNetworkInfo.deployments.fiberRouter;
    const fiberRouter = await hre.ethers.getContractAt("FiberRouter", fiberRouterAddress);
    const platformFee = await fiberRouter.platformFee()

    const srcFoundry = currentNetworkInfo.foundry
    const dstFoundry = dstNetworkInfo.foundry
    const fromToken = currentNetworkInfo.weth
    const toToken = "0x4200000000000000000000000000000000000006"
    const amountIn = 20000000000000n
    
    const srcRes = await get1InchData(42161, fromToken, srcFoundry, amountIn, fiberRouterAddress, fiberRouterAddress)

    console.log("Source 1inch data: ", srcRes)

    await timeout(1000)

    const dstRes = await get1InchData(8453, dstFoundry, toToken, BigInt(srcRes.amountOut) - platformFee, dstFiberRouterAddress, walletAddress)
    const dstData = abiCoder.encode(
        ["address", "uint256", "address", "bytes"],
        [toToken, Math.floor(dstRes.amountOut * (1 - slippage/100)), oneInchRouterAddress, dstRes.data]
    )

    console.log("Destination 1inch data: ", dstRes)

    const tx = await fiberRouter.swapAndCrossAndSwap(
        fromToken,
        srcFoundry,
        amountIn,
        Math.floor(srcRes.amountOut * (1 - slippage/100)),
        10n ** 18n,
        walletAddress,
        8453,
        0,
        "0x",
        oneInchRouterAddress,
        srcRes.data,
        dstData
    )

    console.log("hash: ", tx.hash)
    await tx.wait()
    console.log("confirmed")
}

async function get1InchData(chainId, src, dst, amount, fiberRouterAddress, receiver) {

    let config = {
        headers: {
            Authorization: `Bearer ${process.env.ONEINCH_API_KEY!}`,
        },
    };
    
    let url = `https://api.1inch.dev/swap/v6.0/${chainId}/swap?src=${src}&dst=${dst}&amount=${amount}&from=${fiberRouterAddress}&receiver=${receiver}&slippage=${slippage}&disableEstimate=true&origin=${walletAddress}`;
    let res = await axios.get(url, config);

    return {
        data: res.data.tx.data,
        amountOut: res.data.dstAmount
    }
}

async function timeout(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
