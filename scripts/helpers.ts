import { ContractTransaction } from "ethers";

export const sendTx = async (txPromise: Promise<ContractTransaction>, successMessage: string) => {
    const tx = await txPromise;
    console.log(successMessage);
    await tx.wait();
    return tx;
};

export const getSourceSignature = (fiberRouterAddress: string, foundryAddress: string, feeDistributionData: any, chainId: number) => {
    // Implement this function based on your contract's requirements
    // This is a placeholder implementation
    return "dummySignature";
};
