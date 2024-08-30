import hre from "hardhat";


async function main() {
    const usdc = await hre.ethers.getContractAt("Token", "0xF45fCD48BdAB3156fF31a74161a454afa749a170");
    const amount = 100000000n * (10n ** 18n)
    const tx = await usdc.mint("0x93069da82B264E94068aA991b88b3478cf0861BE", amount)
    tx.wait()
}

main()
.then(() => process.exit(0))
.catch((error) => {
    console.error(error);
    process.exit(1);
});
