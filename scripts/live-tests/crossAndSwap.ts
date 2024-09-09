import hre from "hardhat";
import addresses from "../../constants/addresses_test.json";
import axios from "axios";
import { AbiCoder } from "ethers";

const walletAddress = "0x93069da82B264E94068aA991b88b3478cf0861BE"
const abiCoder = AbiCoder.defaultAbiCoder()
const slippage = 2

async function main() {
    const thisNetwork = hre.network.name;
    const currentNetworkInfo = addresses.networks[thisNetwork];
    const dstNetworkInfo = addresses.networks["base"];
    const targetChainID = dstNetworkInfo.chainId;
    const fiberRouterAddress = currentNetworkInfo.deployments.fiberRouter;
    const dstFiberRouterAddress = dstNetworkInfo.deployments.fiberRouter;
    const fiberRouter = await hre.ethers.getContractAt("FiberRouter", fiberRouterAddress);
    const platformFee = await fiberRouter.platformFee()

    const srcFoundry = currentNetworkInfo.foundry
    const dstFoundry = dstNetworkInfo.foundry
    const toToken = "0x7f5373AE26c3E8FfC4c77b7255DF7eC1A9aF52a6"
    const amountIn = 10000n
    const srcFoundryContract = await hre.ethers.getContractAt("Token", srcFoundry);
    const approveFoundryTx = await srcFoundryContract.approve(fiberRouterAddress, amountIn)
    approveFoundryTx.wait()
    console.log("Approved Foundry")

    const oneInchRouterAddress = "0x111111125421ca6dc452d289314280a0f8842a65"

    const res = await get1InchData(currentNetworkInfo.chainId, dstFoundry, toToken, amountIn, dstFiberRouterAddress, walletAddress)

    console.log(res)

    const dstData = abiCoder.encode(
        ["address", "uint256", "address", "bytes"],
        [toToken, Math.floor(res.amountOut * (1 - slippage/100)), oneInchRouterAddress, res.data]
    )

    console.log(Math.floor(res.amountOut * (1 - slippage/100)))

    const tx = await fiberRouter.crossAndSwap(
        srcFoundry,
        amountIn,
        10n ** 18n,
        walletAddress,
        targetChainID,
        0,
        "0x",
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

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
