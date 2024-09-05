// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { BaseRouter } from "./BaseRouter.sol";
import { FeeDistributor } from "./FeeDistributor.sol";
import { CCIPApp } from "./CCIPApp.sol";
import { IWETH } from "./common/IWETH.sol";
import { StargateComposer } from "./StargateComposer.sol";
import { QuantumPortalApp } from "./QuantumPortalApp.sol";


contract FiberRouter is FeeDistributor, StargateComposer, QuantumPortalApp, CCIPApp {
    constructor(
        address pool,
        address weth,
        address portal,
        address ccipRouter
    ) QuantumPortalApp(portal) Ownable(tx.origin) CCIPApp(ccipRouter) BaseRouter(pool, weth) {}

    //#############################################################
    //###################### USER FUNCTIONS #######################
    //#############################################################


    function swapOnSameNetwork(
        uint256 amountIn,
        uint256 minAmountOut,
        address fromToken,
        address toToken,
        address targetAddress,
        address router,
        bytes memory routerCalldata
    ) external nonReentrant {
        _swapOnSameNetwork(
            amountIn,
            minAmountOut,
            fromToken,
            toToken,
            targetAddress,
            router,
            routerCalldata
        );
    }

    function _swapOnSameNetwork(
        uint256 amountIn,
        uint256 minAmountOut,
        address fromToken,
        address toToken,
        address targetAddress,
        address router,
        bytes memory routerCalldata
    ) internal {
        // Validation checks
        require(fromToken != address(0), "FR: From token address cannot be zero");
        require(toToken != address(0), "FR: To token address cannot be zero");
        require(amountIn != 0, "FR: Amount in must be greater than zero");
        require(minAmountOut != 0, "FR: Amount out must be greater than zero");
        require(targetAddress != address(0), "FR: Target address cannot be zero");

        // Move tokens from the user to the contract
        amountIn = _moveTokens(fromToken, msg.sender, address(this), amountIn);

        // Perform the token swap
        uint256 amountOut = _swap(
            targetAddress,
            fromToken,
            toToken,
            amountIn,
            minAmountOut,
            router,
            routerCalldata
        );

        // Emit Swap event
        emit SwapSameNetwork(
            fromToken,
            toToken,
            amountIn,
            amountOut,
            msg.sender,
            targetAddress
        );
    }

    function swapOnSameNetworkETH(
        uint256 minAmountOut,
        address toToken,
        address targetAddress,
        address router,
        bytes memory routerCalldata
    ) external payable {
        _swapOnSameNetworkETH(
            minAmountOut,
            toToken,
            targetAddress,
            router,
            routerCalldata
        );
    }

    function _swapOnSameNetworkETH(
        uint256 minAmountOut,
        address toToken,
        address targetAddress,
        address router,
        bytes memory routerCalldata
    ) internal {
        uint256 amountIn = msg.value;
        
        // Validation checks
        require(toToken != address(0), "FR: To token address cannot be zero");
        require(amountIn != 0, "FR: Amount in must be greater than zero");
        require(minAmountOut != 0, "FR: Amount out must be greater than zero");
        require(targetAddress != address(0), "FR: Target address cannot be zero");
        require(bytes(routerCalldata).length != 0, "FR: Calldata cannot be empty");

        // Deposit ETH and get WETH
        IWETH(weth).deposit{value: amountIn}();

        uint256 amountOut = _swap(
            targetAddress,
            weth,
            toToken,
            amountIn,
            minAmountOut,
            router,
            routerCalldata
        );

        // Emit Swap event
        emit SwapSameNetwork(
            NATIVE_CURRENCY,
            toToken,
            amountIn,
            amountOut,
            msg.sender,
            targetAddress
        );
    }

    function cross(
        address sourceFoundryToken,
        uint256 amountIn,
        uint256 feeAmount,
        address recipient,
        uint64 dstChainId,
        uint256 swapType,
        bytes memory refSigData
    ) external payable {
        _cross(
            sourceFoundryToken,
            amountIn,
            feeAmount,
            recipient,
            dstChainId,
            swapType,
            refSigData,
            new bytes(0)
        );
    }

    function crossAndSwap(
        address sourceFoundryToken,
        uint256 amountIn,
        uint256 feeAmount,
        address recipient,
        uint64 dstChainId,
        uint256 swapType,
        bytes memory refSigData,
        bytes memory dstData
    ) external payable {
        _cross(
            sourceFoundryToken,
            amountIn,
            feeAmount,
            recipient,
            dstChainId,
            swapType,
            refSigData,
            dstData
        );
    }

    function swapAndCross(
        address fromToken,
        address sourceFoundryToken,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 feeAmount,
        address recipient,
        uint64 dstChainId,
        uint256 swapType,
        bytes memory refSigData,
        address router,
        bytes calldata srcRouterCalldata
    ) external payable {
        _swapAndCross(
            fromToken,
            sourceFoundryToken,
            amountIn,
            minAmountOut,
            feeAmount,
            recipient,
            dstChainId,
            swapType,
            refSigData,
            router,
            srcRouterCalldata,
            new bytes(0)
        );
    }

    function swapAndCrossAndSwap(
        address fromToken,
        address sourceFoundryToken,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 feeAmount,
        address recipient,
        uint64 dstChainId,
        uint256 swapType,
        bytes memory refSigData,
        address router,
        bytes calldata srcRouterCalldata,
        bytes memory dstData
    ) external payable {
        _swapAndCross(
            fromToken,
            sourceFoundryToken,
            amountIn,
            minAmountOut,
            feeAmount,
            recipient,
            dstChainId,
            swapType,
            refSigData,
            router,
            srcRouterCalldata,
            dstData
        );
    }

    //#############################################################
    //################# INTERNAL LOGIC FUNCTIONS ##################
    //#############################################################
    function _cross(
        address sourceFoundryToken,
        uint256 amountIn,
        uint256 feeAmount,
        address recipient,
        uint64 dstChainId,
        uint256 swapType,
        bytes memory refSigData,
        bytes memory dstData
    ) internal {
        require(amountIn > 0, "FR: Amount in must be greater than zero");
        require(recipient != address(0), "FR: Recipient address cannot be zero");

        amountIn = _moveTokens(sourceFoundryToken, msg.sender, address(this), amountIn);
        amountIn = _distributeFees(msg.sender, sourceFoundryToken, amountIn, refSigData);

        if (swapType == 0) {
            amountIn = _transferToPool(sourceFoundryToken, address(this), amountIn);
            _bridgeWithPortal(dstChainId, recipient, sourceFoundryToken, amountIn, feeAmount, dstData);
        } else if (swapType == 1) {
            dstData = dstData.length > 0 ? _concatDstDataToRecipient(recipient, dstData) : abi.encode(recipient);
            _bridgeWithCcip(dstChainId, sourceFoundryToken, amountIn, dstData);
        } else if (swapType == 2) {
            _bridgeWithStargate(amountIn, msg.sender, recipient, dstChainId);
        } else {
            revert("FR: Invalid swap type");
        }
    }

    function _swapAndCross(
        address fromToken,
        address sourceFoundryToken,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 feeAmount,
        address recipient,
        uint64 dstChainId,
        uint256 swapType,
        bytes memory refSigData,
        address router,
        bytes calldata srcRouterCalldata,
        bytes memory dstData
    ) internal {

        // Check if the fromToken is the NATIVE Token
        if (fromToken == NATIVE_CURRENCY) {
            amountIn = msg.value;
            // Convert ETH to WETH
            IWETH(weth).deposit{value: amountIn}();
            fromToken = weth; // Update fromToken to WETH address
        } else {
            // If not NATIVE Token, transfer ERC20 token to contract
            amountIn = _moveTokens(fromToken, msg.sender, address(this), amountIn);
        }

       //  amountIn = _moveTokens(fromToken, msg.sender, address(this), amountIn);

        uint256 amountOut = _swap(
            address(this),
            fromToken,
            sourceFoundryToken,
            amountIn,
            minAmountOut,
            router,
            srcRouterCalldata
        );

        amountOut = _distributeFees(msg.sender, sourceFoundryToken, amountOut, refSigData);

        if (swapType == 0) {
            amountOut = _transferToPool(sourceFoundryToken, address(this), amountOut);
            _bridgeWithPortal(dstChainId, recipient, sourceFoundryToken, amountOut, feeAmount, dstData);
        } else if (swapType == 1) {
            dstData = dstData.length > 0 ? _concatDstDataToRecipient(recipient, dstData) : abi.encode(recipient);
            _bridgeWithCcip(dstChainId, sourceFoundryToken, amountOut, dstData);
        } else {
            revert("FR: Invalid swap type");
        }
    }
}
