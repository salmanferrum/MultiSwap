import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import hre from "hardhat";
import addresses from "../../constants/addresses_test.json"

const testLiquidityAmount = 100000000000000000n

const deployModule = buildModule("Deploy", (m) => {
    const currentNetwork = hre.network.name
    const deployer = m.getAccount(0)

    // Parameters for deployment
    const portalAddress = m.getParameter("quantumPortal", addresses.networks[currentNetwork].quantumPortal)
    const gasWalletAddress = m.getParameter("gasWalletAddress", deployer)
    const settlementManagerAddress = m.getParameter("settlementManager", deployer)
    const liquidityManagerAddress = m.getParameter("liquidityManager", deployer)
    const liquidityManagerBotAddress = m.getParameter("liquidityManagerBot", deployer)
    const withdrawalAddress = m.getParameter("withdrawalAddress", deployer)
    const ccipRouter = m.getParameter("ccipRouter", addresses.networks[currentNetwork].ccip.router)
    const oneInchRouter = m.getParameter("oneInchRouter", addresses.networks[currentNetwork].swapRouters[0].router)
    const oneInchRouterSelectors = m.getParameter("oneInchRouterSelectors", addresses.networks[currentNetwork].swapRouters[0].selectors)
    const platformFee = m.getParameter("platformFee", addresses.platformFee)

    // USDC contract
    const usdc = m.contractAt("Token", addresses.networks[currentNetwork].foundry)

    // Deploy Pool contract
    const pool = m.contract("Pool", [
        settlementManagerAddress,
        liquidityManagerAddress,
        liquidityManagerBotAddress,
        withdrawalAddress,
        ccipRouter
    ])

    // Deploy FiberRouter contract
    const fiberRouter = m.contract("FiberRouter", [
        pool,
        gasWalletAddress,
        portalAddress,
        ccipRouter
    ])

    // Post deployment configs
    m.call(pool, "setFiberRouter", [fiberRouter])
    m.call(fiberRouter, "addRouterAndSelectors", [oneInchRouter, oneInchRouterSelectors])
    m.call(usdc, "approve", [pool, testLiquidityAmount])
    
    m.call(fiberRouter, "setPlatformFee", [platformFee])
    m.call(fiberRouter, "setFeeWallet", [deployer])

    return { fiberRouter, pool, usdc }
});

// Seperate liquidity add to make sure it is called after spend is approved
const configModule = buildModule("DeployConfig", (m) => {
    const {fiberRouter, pool, usdc} = m.useModule(deployModule)

    m.call(pool, "addLiquidity", [usdc, testLiquidityAmount])

    return {fiberRouter, pool}
});

export default configModule;
