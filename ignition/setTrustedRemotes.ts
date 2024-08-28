import hre from "hardhat";
import addresses from "../constants/addresses.json";

async function main() {
    const thisNetwork = hre.network.name;

    // Ensure the network is valid
    if (!addresses.networks[thisNetwork]) {
        throw new Error(`Network ${thisNetwork} is not configured in addresses.json`);
    }

    const ccipNetworks = Object.keys(addresses.networks).filter(
        (network) => addresses.networks[network].ccip !== undefined
    );
    const isCcip = ccipNetworks.includes(thisNetwork);

    const currentNetworkInfo = addresses.networks[thisNetwork];
    const fiberRouterAddress = currentNetworkInfo.deployments.fiberRouter;
    const poolAddress = currentNetworkInfo.deployments.pool;
    const fiberRouter = await hre.ethers.getContractAt("FiberRouter", fiberRouterAddress);
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
            //ccipChainSelectors.push(networkInfo.ccip.chainSelector);
            //remotePools.push(networkInfo.deployments.pool);
        }
    }

    // Add trusted remotes for FiberRouter
    await fiberRouter.addTrustedRemotes(chainIds, remoteRouters);
    console.log(`Trusted remotes set for ${thisNetwork}`);

    // Add token paths
    for (const [networkName, networkInfo] of Object.entries(addresses.networks)) {
        if (networkName !== thisNetwork && networkName !== "hardhat" && networkName !== "localhost") {
            const srcToken = currentNetworkInfo.foundry; // Replace with your source token address
            const dstToken = networkInfo.foundry; // Replace with the destination token address
            const chainId = networkInfo.chainId;

            await fiberRouter.addTokenPaths([srcToken], [chainId], [dstToken]);
            console.log(`Token paths added from ${srcToken} on ${thisNetwork} to ${dstToken} on ${networkName}`);
        }
    }

    // If the pool contract also needs to add trusted remotes (uncomment if required)
    // await pool.addTrustedRemotes(ccipChainSelectors, remotePools);
    // console.log(`Trusted remotes set for pool on ${thisNetwork}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
