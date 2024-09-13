import hre from "hardhat";
import addresses from "../../constants/addresses_test.json";

async function main() {
    const thisNetwork = hre.network.name;

    // Ensure the network is valid
    if (!addresses.networks[thisNetwork]) {
        throw new Error(`Network ${thisNetwork} is not configured in addresses.json`);
    }

    const currentNetworkInfo = addresses.networks[thisNetwork];
    const pool = await hre.ethers.getContractAt("Pool", currentNetworkInfo.deployments.pool);
    const usdc = await hre.ethers.getContractAt("MockUSDC", currentNetworkInfo.foundry);
    const liquidityAmount = 5n * (10n ** 18n)
    console.log(liquidityAmount)
    const tx = await usdc.approve(pool, liquidityAmount)
    tx.wait()
    console.log("Adding liquidity")
    await pool.addLiquidity(usdc, liquidityAmount)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
