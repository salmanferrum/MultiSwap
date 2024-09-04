import hre from "hardhat";
import addresses from "../../constants/addresses_test.json";

async function main() {
    const targetNetwork = "ferrum_testnet";
    const thisNetwork = hre.network.name;
    const targetNetworkInfo = addresses.networks[targetNetwork];
    const targetChainID = targetNetworkInfo.chainId;
    const currentNetworkInfo = addresses.networks[thisNetwork];

    const fiberRouterAddress = currentNetworkInfo.deployments.fiberRouter;
    const fiberRouter = await hre.ethers.getContractAt("FiberRouter", fiberRouterAddress);
    const recipient = "0x2F169deC5B55420864967f28D545A2898c71b28B"
    const foundryAddress = "0x6FCF42A7EFFC92410CE6dc8fC13bD4600abe7bB6"
    const qpFeeTokenAddress = "0x6d34420dcaf516bec9d81e5d79fac2100058c9ac"
    const amountIn = 10000000n
    const qpFeeAmount = 10n ** 18n;

    const mockFoundry = await hre.ethers.getContractAt("Token", foundryAddress);
    const qpFeeToken = await hre.ethers.getContractAt("Token", qpFeeTokenAddress);

    const approveFoundryTx = await mockFoundry.approve(fiberRouterAddress, amountIn)
    approveFoundryTx.wait()
    console.log("Approved Foundry")

    const approveQpFeeTokenTx = await qpFeeToken.approve(fiberRouterAddress, qpFeeAmount)
    approveQpFeeTokenTx.wait()
    console.log("Approved QP Fee Token")

    const tx = await fiberRouter.cross(
        mockFoundry,
        amountIn,
        qpFeeAmount,
        recipient,
        targetChainID,
        0,
        "0x",
        {
            gasLimit: 5000000
        }
    )

    console.log("hash: ", tx.hash)
    await tx.wait()
    console.log("confirmed")
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
