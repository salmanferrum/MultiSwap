import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { AbiCoder, Contract, id, randomBytes, Wallet } from "ethers";
import hre from "hardhat";
import MultiswapModule from "../ignition/modules/MultiSwap";


const chainId = 31337
const million = 1000000n
const abiCoder = AbiCoder.defaultAbiCoder()

describe("FiberRouter", () => {
    const platformFee = 100n
    let fiberRouterSrc,
        fiberRouterDst,
        interchainTokenService,
        poolSrc,
        poolDst,
        quantumPortal,
        swapRouter,
        usdcSrc,
        usdcDst,
        frm,
        wethSrc,
        wethDst,
        signer,
        recipient,
        portalFeeRecipient,
        multiswapFeeRecipient,
        ccipConfig

    async function deploymentFixture() {
        [signer, recipient, portalFeeRecipient, multiswapFeeRecipient] = await hre.ethers.getSigners()

        quantumPortal = await hre.ethers.deployContract("QuantumPortal")
        swapRouter = await hre.ethers.deployContract("SwapRouter")
        interchainTokenService = await hre.ethers.deployContract("InterchainTokenService")
        usdcSrc = await hre.ethers.deployContract("Token")
        usdcDst = await hre.ethers.deployContract("Token")
        frm = await hre.ethers.deployContract("Token")
        wethSrc = await hre.ethers.deployContract("Token")
        wethDst = await hre.ethers.deployContract("Token")

        const localSimulatorFactory = await hre.ethers.getContractFactory("CCIPLocalSimulator");
        const localSimulator = await localSimulatorFactory.deploy();

        const config: {
            chainSelector_: bigint;
            sourceRouter_: string;
            destinationRouter_: string;
            wrappedNative_: string;
            linkToken_: string;
            ccipBnM_: string;
            ccipLnM_: string;
        } = await localSimulator.configuration();

        ccipConfig = config

        let { fiberRouter, pool } = await hre.ignition.deploy(MultiswapModule, {
            parameters: {
                MultiSwap: {
                    quantumPortal: await quantumPortal.getAddress(),
                    interchainTokenService: await interchainTokenService.getAddress(),
                    ccipRouter: config.sourceRouter_
                }
            }
        })

        await fiberRouter.setChainIdAndCcipChainSelectorPairs([chainId], [config.chainSelector_])

        fiberRouterSrc = fiberRouter
        poolSrc = pool;

        ({ fiberRouter, pool } = await hre.ignition.deploy(MultiswapModule, {
            parameters: {
                MultiSwap: {
                    quantumPortal: await quantumPortal.getAddress(),
                    ccipRouter: config.destinationRouter_
                }
            }
        }))

        await fiberRouter.setChainIdAndCcipChainSelectorPairs([chainId], [config.chainSelector_])
        fiberRouterDst = fiberRouter
        poolDst = pool
    }

    beforeEach("should deploy and config MultiSwap", async () => {
        await loadFixture(deploymentFixture)

        expect(await fiberRouterSrc.pool()).to.equal(await poolSrc.getAddress())
        expect(await fiberRouterDst.pool()).to.equal(await poolDst.getAddress())
        expect(await poolSrc.fiberRouter()).to.equal(await fiberRouterSrc.getAddress())
        expect(await poolDst.fiberRouter()).to.equal(await fiberRouterDst.getAddress())

        // Add token paths
        await fiberRouterSrc.addTokenPaths([usdcSrc], [chainId], [usdcDst])
        await fiberRouterDst.addTokenPaths([usdcDst], [chainId], [usdcSrc])
        await fiberRouterSrc.addTokenPaths([ccipConfig.ccipBnM_], [chainId], [ccipConfig.ccipBnM_])
        await fiberRouterDst.addTokenPaths([ccipConfig.ccipBnM_], [chainId], [ccipConfig.ccipBnM_])

        expect(await fiberRouterSrc.tokenPaths(usdcSrc, chainId)).to.equal(await usdcDst.getAddress())
        expect(await fiberRouterDst.tokenPaths(usdcDst, chainId)).to.equal(await usdcSrc.getAddress())

        // Add trusted remotes
        await fiberRouterSrc.addTrustedRemotes([chainId], [fiberRouterDst])
        await fiberRouterDst.addTrustedRemotes([chainId], [fiberRouterSrc])
        expect(await fiberRouterSrc.trustedRemoteRouters(chainId)).to.equal(await fiberRouterDst.getAddress())

        // Whitelist router and selectors
        await fiberRouterSrc.addRouterAndSelectors(swapRouter, [swapRouter.interface.getFunction("swapExactTokensForTokens").selector])
        await fiberRouterDst.addRouterAndSelectors(swapRouter, [
            swapRouter.interface.getFunction("swapExactTokensForTokens").selector,
            swapRouter.interface.getFunction("failingSwapExactTokensForTokens").selector
        ])

        // Mint tokens
        await usdcSrc.mint(swapRouter, million)
        await usdcSrc.mint(signer, million)
        await wethSrc.mint(signer, million)
        await frm.mint(signer, million ** 4n)
        await wethDst.mint(swapRouter, million)

        // Add liquidity to pools
        await usdcSrc.mint(signer, million)
        await usdcSrc.approve(poolSrc, million)
        await poolSrc.addLiquidity(usdcSrc, million)

        await usdcDst.mint(signer, million)
        await usdcDst.approve(poolDst, million)
        await poolDst.addLiquidity(usdcDst, million)

        // Set fee token on portal
        await frm.approve(fiberRouterSrc, million ** 4n)
        await quantumPortal.setFeeToken(frm)
        await quantumPortal.setFeeTarget(portalFeeRecipient)

        // Set multiswap platform fee
        await fiberRouterSrc.setFeeWallet(multiswapFeeRecipient)
        await fiberRouterSrc.setPlatformFee(platformFee)
    })

    describe("Quantum Portal", () => {
        it("Sould do a cross chain transfer", async () => {
            const amount = 100000n
            const frmBridgeFee = 1234n

            await usdcSrc.approve(fiberRouterSrc, amount)
            const refSigData = await getDummyReferralSig("dummy", fiberRouterSrc)

            const tx = fiberRouterSrc.cross(
                usdcSrc,
                amount,
                frmBridgeFee,
                recipient,
                chainId,
                0,
                refSigData
            )

            await expect(tx).to.changeTokenBalances(
                usdcSrc,
                [signer, fiberRouterSrc, poolSrc, poolDst, recipient, multiswapFeeRecipient],
                [-amount, 0, amount-platformFee, 0, 0, platformFee]
            )

            await expect(tx).to.changeTokenBalances(
                usdcDst,
                [signer, fiberRouterDst, poolSrc, poolDst, recipient],
                [0, 0, 0, -amount+platformFee, amount-platformFee]
            )

            await expect(tx).to.changeTokenBalances(
                frm,
                [signer, portalFeeRecipient],
                [-frmBridgeFee, frmBridgeFee]
            )
        })

        it("Should swap tokens and do a cross chain transfer", async () => {
            await wethSrc.approve(fiberRouterSrc, million)
            const amount = 100000n
            const amountOut = 90000n
            const bridgeFee = 10n

            const routerCalldata = swapRouter.interface.encodeFunctionData(
                "swapExactTokensForTokens",
                [amount, amountOut, await wethSrc.getAddress(), await usdcSrc.getAddress(), await fiberRouterSrc.getAddress()]
            )

            const refSigData = await getDummyReferralSig("dummy", fiberRouterSrc)

            const tx = fiberRouterSrc.swapAndCross(
                wethSrc,
                usdcSrc,
                amount,
                amountOut,
                bridgeFee,
                recipient,
                chainId,
                0,
                refSigData,
                swapRouter,
                routerCalldata
            )

            await expect(tx).to.changeTokenBalances(
                wethSrc,
                [signer, fiberRouterSrc, poolSrc, swapRouter, poolDst, recipient, multiswapFeeRecipient],
                [-amount, 0, 0, amount, 0, 0, 0]
            )

            await expect(tx).to.changeTokenBalances(
                usdcSrc,
                [signer, fiberRouterSrc, poolSrc, swapRouter, poolDst, recipient, multiswapFeeRecipient],
                [0, 0, amountOut-platformFee, -amountOut, 0, 0, platformFee]
            )

            await expect(tx).to.changeTokenBalances(
                usdcDst,
                [signer, fiberRouterSrc, poolSrc, swapRouter, poolDst, recipient],
                [0, 0, 0, 0, -amountOut+platformFee, amountOut-platformFee]
            )

            await expect(tx).to.changeTokenBalances(
                frm,
                [signer, portalFeeRecipient],
                [-bridgeFee, bridgeFee]
            )
        })

        it("Should do a cross-chain transfer and swap on destination side", async () => {
            const amountIn = 100000n
            const bridgeAmount = amountIn - platformFee
            const minAmountOut = 90000n
            const frmBridgeFee = 1234n

            await usdcSrc.approve(fiberRouterSrc, amountIn)

            const dstRouterCalldata = swapRouter.interface.encodeFunctionData(
                "swapExactTokensForTokens",
                [bridgeAmount, minAmountOut, await usdcDst.getAddress(), await wethDst.getAddress(), recipient.address]
            )
            
            const dstData = abiCoder.encode(
                ["address", "uint256", "address", "bytes"],
                [await wethDst.getAddress(), minAmountOut, swapRouter.target, dstRouterCalldata]
            )

            const refSigData = await getDummyReferralSig("dummy", fiberRouterSrc)
            
            const tx = fiberRouterSrc.crossAndSwap(
                usdcSrc,
                amountIn,
                frmBridgeFee,
                recipient,
                chainId,
                0,
                refSigData,
                dstData
            )

            await expect(tx).to.changeTokenBalances(
                usdcSrc,
                [signer, fiberRouterSrc, poolSrc, fiberRouterDst, poolDst, swapRouter, recipient, multiswapFeeRecipient],
                [-amountIn, 0, bridgeAmount, 0, 0, 0, 0, platformFee]
            )

            await expect(tx).to.changeTokenBalances(
                usdcDst,
                [signer, fiberRouterSrc, poolSrc, fiberRouterDst, poolDst, swapRouter, recipient, multiswapFeeRecipient],
                [0, 0, 0, 0, -bridgeAmount, bridgeAmount, 0, 0]
            )

            await expect(tx).to.changeTokenBalances(
                wethDst,
                [signer, fiberRouterSrc, poolSrc, fiberRouterDst, poolDst, swapRouter, recipient, multiswapFeeRecipient],
                [0, 0, 0, 0, 0, -minAmountOut, minAmountOut, 0]
            )

            await expect(tx).to.changeTokenBalances(
                frm,
                [signer, portalFeeRecipient],
                [-frmBridgeFee, frmBridgeFee]
            )
        })

        it("should swap tokens, do a cross-chain transfer, and swap on destination side", async () => {
            const amountIn = 100000n
            const srcAmountOut = 90000n
            const bridgeAmount = srcAmountOut - platformFee
            const minAmountOut = 80000n
            const frmBridgeFee = 1234n

            await wethSrc.approve(fiberRouterSrc, amountIn)

            const srcRouterCalldata = swapRouter.interface.encodeFunctionData(
                "swapExactTokensForTokens",
                [amountIn, srcAmountOut, await wethSrc.getAddress(), await usdcSrc.getAddress(), await fiberRouterSrc.getAddress()]
            )

            const dstRouterCalldata = swapRouter.interface.encodeFunctionData(
                "swapExactTokensForTokens",
                [bridgeAmount, minAmountOut, await usdcDst.getAddress(), await wethDst.getAddress(), recipient.address]
            )

            const dstData = abiCoder.encode(
                ["address", "uint256", "address", "bytes"],
                [await wethDst.getAddress(), minAmountOut, swapRouter.target, dstRouterCalldata]
            )

            const refSigData = await getDummyReferralSig("dummy", fiberRouterSrc)

            const tx = fiberRouterSrc.swapAndCrossAndSwap(
                wethSrc,
                usdcSrc,
                amountIn,
                srcAmountOut,
                frmBridgeFee,
                recipient,
                chainId,
                0,
                refSigData,
                swapRouter,
                srcRouterCalldata,
                dstData
            )

            await expect(tx).to.changeTokenBalances(
                wethSrc,
                [signer, fiberRouterSrc, poolSrc, fiberRouterDst, poolDst, swapRouter, recipient, multiswapFeeRecipient],
                [-amountIn, 0, 0, 0, 0, amountIn, 0, 0]
            )

            await expect(tx).to.changeTokenBalances(
                usdcSrc,
                [signer, fiberRouterSrc, poolSrc, fiberRouterDst, poolDst, swapRouter, recipient, multiswapFeeRecipient],
                [0, 0, bridgeAmount, 0, 0, -srcAmountOut, 0, platformFee]
            )

            await expect(tx).to.changeTokenBalances(
                usdcDst,
                [signer, fiberRouterSrc, poolSrc, fiberRouterDst, poolDst, swapRouter, recipient, multiswapFeeRecipient],
                [0, 0, 0, 0, -bridgeAmount, bridgeAmount, 0, 0]
            )

            await expect(tx).to.changeTokenBalances(
                wethDst,
                [signer, fiberRouterSrc, poolSrc, fiberRouterDst, poolDst, swapRouter, recipient, multiswapFeeRecipient],
                [0, 0, 0, 0, 0, -minAmountOut, minAmountOut, 0]
            )

            await expect(tx).to.changeTokenBalances(
                frm,
                [signer, portalFeeRecipient],
                [-frmBridgeFee, frmBridgeFee]
            )
        })
    })
})

const getDummyReferralSig = async (referralCode:string, fiberRouterSrc:Contract) => {
    const salt = "0x" + Buffer.from(randomBytes(32)).toString("hex")
    const expiry = Math.floor(Date.now() / 1000) + 180
    const fakeWallet = new Wallet(id(referralCode))
    
    const domain = {
        name: "FEE_DISTRIBUTOR",
        version: "000.001",
        chainId,
        verifyingContract: fiberRouterSrc.target as string
    };

    const types = {
        ReferralSignature: [
            { name: "salt", type: "bytes32" },
            { name: "expiry", type: "uint256" }
        ],
    };

    const values = {
        salt,
        expiry
    };

    const signature = await fakeWallet.signTypedData(domain, types, values);
    
    return {
        salt,
        expiry,
        signature
    }
}