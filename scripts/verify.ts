import hre from "hardhat";
import addresses from "../constants/addresses.json";

async function main() {
    const currentNetwork = hre.network.name;

    // Retrieve deployed contract addresses from your addresses.json
    const fiberRouterAddress = addresses.networks[currentNetwork].deployments.fiberRouter;
    const poolAddress = addresses.networks[currentNetwork].deployments.pool;

    // Parameters used during the deployment
    const settlementManagerAddress = addresses.settlementManager;
    const liquidityManagerAddress = addresses.liquidityManager;
    const liquidityManagerBotAddress = addresses.liquidityManagerBot;
    const withdrawalAddress = addresses.withdrawal;
    const ccipRouter = addresses.networks[currentNetwork].ccip.router;
   // const ccipRouter = "0x0000000000000000000000000000000000000001"; // Hardcoded value from deployment
    const gasWalletAddress = addresses.gasWallet;
    const portalAddress = addresses.networks[currentNetwork].quantumPortal;

    // Verify Pool contract
    await hre.run("verify:verify", {
        address: poolAddress,
        constructorArguments: [
            settlementManagerAddress,
            liquidityManagerAddress,
            liquidityManagerBotAddress,
            withdrawalAddress,
            ccipRouter
        ],
    });

    console.log(`Verified Pool contract at ${poolAddress}`);

    // Verify FiberRouter contract
    await hre.run("verify:verify", {
        address: fiberRouterAddress,
        constructorArguments: [
            poolAddress,
            gasWalletAddress,
            portalAddress,
            ccipRouter
        ],
    });

    console.log(`Verified FiberRouter contract at ${fiberRouterAddress}`);
}

// Run the verification script
main().catch((error) => {
    console.error("Verification failed:", error);
    process.exit(1);
});
