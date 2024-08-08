import {
time,
loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import hre from "hardhat";
import MultiswapModule from "../ignition/modules/MultiSwap";
import { AbiCoder } from "ethers";

const chainId = 31337
const million = 1000000n

describe("FiberRouter", function () {
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
        weth,
        signer,
        recipient,
        portalFeeRecipient,
        ccipConfig

    async function deploymentFixture() {
        [signer, recipient, portalFeeRecipient] = await hre.ethers.getSigners()

        quantumPortal = await hre.ethers.deployContract("QuantumPortal")
        swapRouter = await hre.ethers.deployContract("SwapRouter")
        interchainTokenService = await hre.ethers.deployContract("InterchainTokenService")
        usdcSrc = await hre.ethers.deployContract("Token")
        usdcDst = await hre.ethers.deployContract("Token")
        frm = await hre.ethers.deployContract("Token")
        weth = await hre.ethers.deployContract("Token")

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

        await fiberRouter.addRouterAndSelectors(swapRouter, ["0x268a380b"])
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

        await fiberRouter.addRouterAndSelectors(swapRouter, ["0x268a380b"])
    }

    beforeEach("should deploy and config MultiSwap", async function () {
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

        // Mint tokens
        await usdcSrc.mint(swapRouter, million)
        await usdcSrc.mint(signer, million * 2n)
        await usdcDst.mint(signer, million * 2n)
        await weth.mint(swapRouter, million)
        await weth.mint(signer, million)
        await frm.mint(signer, million * million * million * million)

        // Add liquidity to pools
        await usdcSrc.approve(poolSrc, million)
        await poolSrc.addLiquidity(usdcSrc, million)
        await usdcDst.approve(poolDst, million)
        await poolDst.addLiquidity(usdcDst, million)

        // Set fee token on portal
        await frm.approve(fiberRouterSrc, million * million)
        await quantumPortal.setFeeToken(frm)
        await quantumPortal.setFeeTarget(portalFeeRecipient)
    })
    
    describe("Quantum Portal", function () {
        
        it("Sould initiate a cross chain transfer", async function () {
            const amount = 100n
            const bridgeFee = 10n

            await usdcSrc.approve(fiberRouterSrc, amount)
            const tx = fiberRouterSrc.cross(
                usdcSrc,
                amount,
                1234,
                recipient,
                chainId,
                0,
                {value: bridgeFee}
            )

            await expect(tx).to.changeTokenBalances(
                usdcSrc,
                [signer, fiberRouterSrc, poolSrc, poolDst, recipient],
                [-amount, 0, amount, 0, 0]
            )

            await expect(tx).to.changeTokenBalances(
                usdcDst,
                [signer, fiberRouterDst, poolSrc, poolDst, recipient],
                [0, 0, 0, -amount, amount]
            )
        })

        it("Should swap tokens and initiate a cross chain transfer", async function () {
            await weth.approve(fiberRouterSrc, million * million)
            const amount = 100n
            const bridgeFee = 10n
            const abiCoder = AbiCoder.defaultAbiCoder()

            const routerCalldata = abiCoder.encode(
                ["uint256", "uint256", "address", "address", "address"],
                [amount, amount / 2n, await weth.getAddress(), await usdcSrc.getAddress(), await fiberRouterSrc.getAddress()]
            )

            const tx = fiberRouterSrc.swapAndCross(
                weth,
                usdcSrc,
                amount,
                amount / 2n,
                bridgeFee,
                recipient,
                chainId,
                0,
                swapRouter,
                "0x268a380b" + routerCalldata.slice(2),
                {value: bridgeFee}
            )

            await expect(tx).to.changeTokenBalances(
                weth,
                [signer, fiberRouterSrc, poolSrc, swapRouter, poolDst, recipient],
                [-amount, 0, 0, amount, 0, 0]
            )

            await expect(tx).to.changeTokenBalances(
                usdcSrc,
                [signer, fiberRouterSrc, poolSrc, swapRouter, poolDst, recipient],
                [0, 0, amount/2n, -amount/2n, 0, 0]
            )

            await expect(tx).to.changeTokenBalances(
                usdcDst,
                [signer, fiberRouterSrc, poolSrc, swapRouter, poolDst, recipient],
                [0, 0, 0, 0, -amount/2n, amount/2n]
            )

            await expect(tx).to.changeTokenBalances(
                frm,
                [signer, portalFeeRecipient],
                [-bridgeFee, bridgeFee]
            )
        })
    })

    describe("CCIP", function () {
        it("Sould initiate a cross chain transfer", async function () {
            

            const amount = 100n
            const bridgeFee = 10n

            await usdcSrc.approve(fiberRouterSrc, amount)
            const tx = fiberRouterSrc.cross(
                usdcSrc,
                amount,
                0,
                recipient,
                chainId,
                0,
                {value: bridgeFee}
            )

            await expect(tx).to.changeTokenBalances(
                usdcSrc,
                [signer, fiberRouterSrc, poolSrc, poolDst, recipient],
                [-amount, 0, amount, 0, 0]
            )
        })

        it("Should swap tokens and initiate a cross chain transfer", async function () {
            const amount = 100n
            const bridgeFee = 10n
            const abiCoder = AbiCoder.defaultAbiCoder()

            await frm.approve(fiberRouterSrc, amount)

            const routerCalldata = abiCoder.encode(
                ["uint256", "uint256", "address", "address", "address"],
                [amount, amount / 2n, await frm.getAddress(), await usdcSrc.getAddress(), await fiberRouterSrc.getAddress()]
            )

            const tx = fiberRouterSrc.swapAndCross(
                frm,
                usdcSrc,
                amount,
                amount / 2n,
                0,
                recipient,
                chainId,
                1,
                swapRouter,
                "0x268a380b" + routerCalldata.slice(2),
                {value: bridgeFee}
            )

            await expect(tx).to.changeTokenBalances(
                frm,
                [signer, fiberRouterSrc, poolSrc, swapRouter, poolDst, recipient],
                [-amount, 0, 0, amount, 0, 0]
            )

            await expect(tx).to.changeTokenBalances(
                usdcSrc,
                [signer, fiberRouterSrc, poolSrc, swapRouter, poolDst, recipient],
                [0, 0, 0, -amount/2n, 0, amount/2n]
            )
        })
    })
})
