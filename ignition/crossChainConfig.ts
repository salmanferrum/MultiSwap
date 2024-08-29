import hre from "hardhat"
import addresses from "../constants/addresses_test.json"


async function main() {
    const thisNetwork = hre.network.name;

    // Ensure the network is valid
    if (!addresses.networks[thisNetwork]) {
        throw new Error(`Network ${thisNetwork} is not configured in addresses.json`);
    }

    const currentNetworkInfo = addresses.networks[thisNetwork];
    const fiberRouter = await hre.ethers.getContractAt("FiberRouter", currentNetworkInfo.deployments.fiberRouter);

    const chainIds: number[] = [];
    const remoteRouters: string[] = [];
    const dstFoundryTokens: string[] = [];
    

    for (const [networkName, networkInfo] of Object.entries(addresses.networks)) {
        if (
            networkName !== thisNetwork &&
            networkName !== "hardhat" &&
            networkName !== "localhost"
        ) {
            chainIds.push(networkInfo.chainId);
            remoteRouters.push(networkInfo.deployments.fiberRouter);
            dstFoundryTokens.push(networkInfo.foundry);
        }
    }
    
    const srcFoundryTokens = new Array(dstFoundryTokens.length).fill(currentNetworkInfo.foundry)
    
    console.log(`Adding remotes ${chainIds} ${remoteRouters}`);
    const addRemotesTx = await fiberRouter.addTrustedRemotes(chainIds, remoteRouters);
    await addRemotesTx.wait();
    
    console.log(`Adding token paths ${srcFoundryTokens} ${chainIds} ${dstFoundryTokens}`);
    const addTokenPathsTx = await fiberRouter.addTokenPaths(srcFoundryTokens, chainIds, dstFoundryTokens);
    await addTokenPathsTx.wait();
}

main()
.then(() => process.exit(0))
.catch((error) => {
    console.error(error)
    process.exit(1)
})
