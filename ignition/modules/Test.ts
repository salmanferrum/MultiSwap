import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import hre from "hardhat";
import addresses from "../../constants/addresses.json"


export default buildModule("MultiSwap", (m) => {
    const currentNetwork = hre.network.name

    // Parameters for deployment from constants.json

    // Parameters for deployment
    const portalAddress = m.getParameter("quantumPortal", addresses.networks[currentNetwork].quantumPortal)
    const wethAddress = m.getParameter("wethAddress", addresses.networks[currentNetwork].weth)
    const settlementManagerAddress = m.getParameter("settlementManager", addresses.settlementManager)
    const liquidityManagerAddress = m.getParameter("liquidityManager", addresses.liquidityManager)
    const liquidityManagerBotAddress = m.getParameter("liquidityManagerBot", addresses.liquidityManagerBot)
    const withdrawalAddress = m.getParameter("withdrawalAddress", addresses.withdrawal)
    const ccipRouter = m.getParameter("ccipRouter", addresses.networks[currentNetwork].ccipRouter)
    const oneInchRouter = m.getParameter("oneInchRouter", addresses.networks[currentNetwork].oneInchRouter)
    // const lzEndpoint = m.getParameter("lzEndpoint", addresses.lzEndpoint)
    const stargateUsdc = m.getParameter("stargateUsdc", addresses.networks[currentNetwork].stargateUsdc)
    
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
        wethAddress,
        portalAddress,
        ccipRouter
    ])

    // Post deployment configuration for FiberRouter contract
    m.call(pool, "setFiberRouter", [fiberRouter])

    return { fiberRouter, pool }
});
