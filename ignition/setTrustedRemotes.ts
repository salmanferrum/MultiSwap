import hre from "hardhat";
import addresses from "../constants/addresses.json";

async function main() {
    const thisNetwork = hre.network.name;

    // Ensure the network is valid
    if (!addresses.networks[thisNetwork]) {
        throw new Error(`Network ${thisNetwork} is not configured in addresses.json`);
    }

    const currentNetworkInfo = addresses.networks[thisNetwork];
    const fiberRouterAddress = currentNetworkInfo.deployments.fiberRouter;
    const poolAddress = currentNetworkInfo.deployments.pool;
    const fiberRouter = await hre.ethers.getContractAt("FiberRouterV2", fiberRouterAddress);
    const pool = await hre.ethers.getContractAt("Pool", poolAddress);

    const chainIds: number[] = [];
    const remoteRouters: string[] = [];
    const ccipChainSelectors: number[] = [];
    const remotePools: string[] = [];

    for (const [networkName, networkInfo] of Object.entries(addresses.networks)) {
        if (
            networkName !== thisNetwork &&
            networkName !== "hardhat" &&
            networkName !== "localhost"
        ) {
            chainIds.push(networkInfo.chainId);
            remoteRouters.push(networkInfo.deployments.fiberRouter);
            ccipChainSelectors.push(networkInfo.ccipChainSelector);
            remotePools.push(networkInfo.deployments.pool);
        }
    }

    await fiberRouter.addTrustedRemotes(chainIds, remoteRouters);
    await pool.addTrustedRemotes(ccipChainSelectors, remotePools);

    console.log(`Trusted remotes set for ${thisNetwork}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
