import hre from "hardhat";
import addresses from "../../constants/addresses.json";

async function main() {
    const thisNetwork = hre.network.name;

    // Ensure the network is valid
    if (!addresses.networks[thisNetwork]) {
        throw new Error(`Network ${thisNetwork} is not configured in addresses.json`);
    }

    const currentNetworkInfo = addresses.networks[thisNetwork];
    const fiberRouterAddress = currentNetworkInfo.deployments.fiberRouter;
    const fiberRouter = await hre.ethers.getContractAt("FiberRouterV2", fiberRouterAddress);

    const router = addresses.networks[thisNetwork].swapRouters[0].router
    const selectors = addresses.networks[thisNetwork].swapRouters[0].selectors

    console.log(`Adding router ${router} with selectors ${selectors} to FiberRouter ${fiberRouterAddress}`)

    await fiberRouter.addRouterAndSelectors(router, selectors)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
