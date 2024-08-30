import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import hre from "hardhat";


const deployModule = buildModule("Deploy", (m) => {

    const mockUSDC = m.contract("MockUSDC", [])
    m.call(mockUSDC, "mint", [m.getAccount(0), 1000000000000000000000000000n])

    return {}
});

export default deployModule;
