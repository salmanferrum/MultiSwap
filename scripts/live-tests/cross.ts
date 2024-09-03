import hre from "hardhat";
import addresses from "../../constants/addresses_test.json";

async function main() {
    const thisNetwork = hre.network.name;
    const currentNetworkInfo = addresses.networks[thisNetwork];
    const fiberRouterAddress = currentNetworkInfo.deployments.fiberRouter;
    const fiberRouter = await hre.ethers.getContractAt("FiberRouter", fiberRouterAddress);
    const recipient = "0x93069da82B264E94068aA991b88b3478cf0861BE"
    const foundryAddress = "0xF45fCD48BdAB3156fF31a74161a454afa749a170"
    const qpFeeTokenAddress = "0x4acc6E4ae8b93d7E5474b0aBb0680D1A16b2f94f"
    const amountIn = 8000000000000000000n
    const qpFeeAmount = 10n ** 18n

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
        42161,
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
