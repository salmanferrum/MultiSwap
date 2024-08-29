import hre from "hardhat";
import addresses from "../../constants/addresses_test.json";
import axios from "axios";

const walletAddress = "0x93069da82B264E94068aA991b88b3478cf0861BE"

async function main() {
    const thisNetwork = hre.network.name;
    const currentNetworkInfo = addresses.networks[thisNetwork];
    const fiberRouterAddress = currentNetworkInfo.deployments.fiberRouter;
    console.log(fiberRouterAddress)
    const fiberRouter = await hre.ethers.getContractAt("FiberRouter", fiberRouterAddress);

    const fromToken = "0x912CE59144191C1204E64559FE8253a0e49E6548"
    const toToken = currentNetworkInfo.foundry
    const amountIn = 26000000000000000n
    const oneInchRouterAddress = "0x111111125421ca6dc452d289314280a0f8842a65"

    const res = await get1InchData(currentNetworkInfo.chainId, fromToken, toToken, amountIn, fiberRouterAddress)

    console.log(res)

    const tx = await fiberRouter.swapAndCross(
        fromToken,
        toToken,
        amountIn,
        res.amountOut,
        10n ** 18n,
        walletAddress,
        8453,
        0,
        "0x",
        oneInchRouterAddress,
        res.data
    )

    console.log("hash: ", tx.hash)
    await tx.wait()
    console.log("confirmed")
}

async function get1InchData(chainId, src, dst, amount, fiberRouterAddress) {

    let config = {
        headers: {
            Authorization: `Bearer ${process.env.ONEINCH_API_KEY!}`,
        },
    };
    const slippage = 2
    
    let url = `https://api.1inch.dev/swap/v6.0/${chainId}/swap?src=${src}&dst=${dst}&amount=${amount}&from=${fiberRouterAddress}&slippage=${slippage}&disableEstimate=true&origin=${walletAddress}`;
    let res = await axios.get(url, config);

    return {
        data: res.data.tx.data,
        amountOut: res.data.dstAmount
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
