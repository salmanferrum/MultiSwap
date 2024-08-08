import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import hre from "hardhat";
import addresses from "../../constants/addresses.json"


export default buildModule("MultiSwap", (m) => {
    const currentNetwork = hre.network.name

    // Parameters for deployment from constants.json

    // Parameters for deployment
    const portalAddress = m.getParameter("quantumPortal", addresses.networks[currentNetwork].quantumPortal)
    const gasWalletAddress = m.getParameter("gasWalletAddress", addresses.gasWallet)
    const settlementManagerAddress = m.getParameter("settlementManager", addresses.settlementManager)
    const liquidityManagerAddress = m.getParameter("liquidityManager", addresses.liquidityManager)
    const liquidityManagerBotAddress = m.getParameter("liquidityManagerBot", addresses.liquidityManagerBot)
    const withdrawalAddress = m.getParameter("withdrawalAddress", addresses.withdrawal)
    const ccipRouter = m.getParameter("ccipRouter", addresses.networks[currentNetwork].ccipRouter)
    const oneInchRouter = m.getParameter("oneInchRouter", addresses.networks[currentNetwork].oneInchRouter)
    const lzEndpoint = m.getParameter("lzEndpoint", addresses.lzEndpoint)
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
        gasWalletAddress,
        portalAddress,
        ccipRouter
    ])

    // Post deployment configuration for FiberRouter contract
    m.call(pool, "setFiberRouter", [fiberRouter])

    // On Arbitrum side
    // m.call(fiberRouter, "addTokenPaths", [
    //     ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831"],
    //     [8453],
    //     ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"]
    // ])
    // m.call(fiberRouter, "setChainIdAndCcipChainSelectorPairs", [[8453], ["15971525489660198786"]])

    // On Base side
    m.call(fiberRouter, "addTokenPaths", [
        ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"],
        [42161],
        ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831"]
    ])
    m.call(fiberRouter, "setChainIdAndCcipChainSelectorPairs", [[42161], ["4949039107694359620"]])

    return { fiberRouter, pool }
});
