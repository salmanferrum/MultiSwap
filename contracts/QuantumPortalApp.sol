// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { BaseRouter } from "./BaseRouter.sol";
import { IQuantumPortalPoc } from "./common/quantum-portal/IQuantumPortalPoc.sol";


abstract contract QuantumPortalApp is BaseRouter {

    IQuantumPortalPoc public portal;

    modifier onlyPortal() {
        require(msg.sender == address(portal), "QPApp: Caller is not the portal");
        _;
    }

    constructor(address _portal) {
        portal = IQuantumPortalPoc(_portal);
    }

    function finalizeCross(
        address token,
        address recipient,
        uint256 bridgedAmount
    ) external onlyPortal {
        require(token != address(0), "FR: Token address cannot be zero");
        require(recipient != address(0), "FR: Payee address cannot be zero");
        require(bridgedAmount != 0, "FR: Amount must be greater than zero");
        
        (uint256 sourceChainId, address sourceRouter,) = portal.msgSender();
        require(trustedRemoteRouters[sourceChainId] == sourceRouter, "FR: Router not trusted");

        pool.finalizeCross(token, recipient, bridgedAmount);
    }

    function finalizeCrossAndSwap(
        address foundryToken,
        address recipient,
        uint256 bridgedAmount,
        bytes calldata dstSwapData
    ) external onlyPortal {
        require(foundryToken != address(0), "FR: Token address cannot be zero");
        require(recipient != address(0), "FR: Payee address cannot be zero");
        require(bridgedAmount != 0, "FR: Amount must be greater than zero");
        
        (uint256 sourceChainId, address sourceRouter,) = portal.msgSender();
        require(trustedRemoteRouters[sourceChainId] == sourceRouter, "FR: Router not trusted");

        pool.finalizeCross(foundryToken, address(this), bridgedAmount);

        (address toToken, uint256 minAmountOut, address router, bytes memory dstRouterCalldata) = abi.decode(dstSwapData, (address, uint256, address, bytes));
        (address settledToken, uint256 amountOut) = _swapOrSettle(
            recipient,
            foundryToken,
            toToken,
            bridgedAmount,
            minAmountOut,
            router,
            dstRouterCalldata
        );

        emit FinalizeCrossAndSwap(settledToken, amountOut, recipient, sourceChainId);
    }

    /**
     * @notice Upddates the qp portal
     * @param _portal the portal
     */
    function updatePortal(address _portal) external onlyOwner {
        portal = IQuantumPortalPoc(_portal);
    }

    function _bridgeWithPortal(
        uint256 dstChainId,
        address recipient,
        address sourceFoundryToken,
        uint256 amount,
        uint256 feeAmount,
        bytes memory dstSwapData
    ) internal {
        _moveTokens(portal.feeToken(), msg.sender, portal.feeTarget(), feeAmount); // FRM

        address remoteFoundryToken = _getAndCheckRemoteFoundryToken(sourceFoundryToken, uint64(dstChainId));

        bytes memory remoteCalldata = dstSwapData.length == 0 ?
            abi.encodeWithSelector(this.finalizeCross.selector, remoteFoundryToken, recipient, amount) :
            abi.encodeWithSelector(this.finalizeCrossAndSwap.selector, remoteFoundryToken, recipient, amount, dstSwapData);

        portal.run(
            uint64(dstChainId), // dstChainId
            trustedRemoteRouters[dstChainId], // targetContractOnDstChain
            recipient, // any refunds
            remoteCalldata // the calldata to be executed on the target contract
        );
    }

    function _transferToPool(
        address token,
        address from,
        uint256 amount
    ) internal returns (uint256) {
        _moveTokens(token, from, address(pool), amount);
        amount = pool.initiateCross(token);
        return amount;
    }
}
