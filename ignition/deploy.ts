import hre from "hardhat"
import * as fs from 'fs';
import path from 'path';
import MultiSwapModule from "./modules/Multiswap"
import addresses from "../constants/addresses_test.json"


const writeJsonToFile = (filePath: string, data: object) => {
    const dataStr = JSON.stringify(data, null, 4);
    fs.writeFileSync(filePath, dataStr, 'utf8');
}

async function main() {
    const { fiberRouter, pool } = await hre.ignition.deploy(MultiSwapModule)
    addresses.networks[hre.network.name].deployments.fiberRouter = await fiberRouter.getAddress();
    addresses.networks[hre.network.name].deployments.pool = await pool.getAddress();
    console.log(`Deployed FiberRouter at ${addresses.networks[hre.network.name].deployments.fiberRouter}`);
    console.log(`Deployed Pool at ${addresses.networks[hre.network.name].deployments.pool}`);
    const filePath = path.join(__dirname, '../constants/addresses_test.json');
    writeJsonToFile(filePath, addresses);
}

main()
.then(() => process.exit(0))
.catch((error) => {
    console.error(error)
    process.exit(1)
})
