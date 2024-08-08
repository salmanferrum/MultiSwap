// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { CCIPReceiver } from '@chainlink/contracts-ccip/src/v0.8/ccip/applications/CCIPReceiver.sol';
import { Client } from "@chainlink/contracts-ccip/src/v0.8/ccip/libraries/Client.sol";
import { IRouterClient } from "@chainlink/contracts-ccip/src/v0.8/ccip/interfaces/IRouterClient.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./LiquidityManagerRole.sol";
import "hardhat/console.sol";


contract Pool is LiquidityManagerRole, CCIPReceiver {

    address public fiberRouter;
    address settlementManager;
    mapping(address => mapping(address => uint256)) public liquidities;

    mapping(uint64 => address) public trustedRemotePools;

    event LiquidityAdded(address indexed user, address indexed token, uint256 amount);
    event LiquidityRemoved(address indexed user, address indexed token, uint256 amount);

    modifier onlyFiberRouter() {
        require(msg.sender == fiberRouter, "Pool: Only fiberRouter method");
        _;
    }

    constructor (
        address _settlementManager,
        address _liquidityManager,
        address _liquidityManagerBot,
        address _withdrawalAddress,
        address _ccipRouter
    ) Ownable(msg.sender) LiquidityManagerRole(_liquidityManager, _liquidityManagerBot, _withdrawalAddress) CCIPReceiver(_ccipRouter) {
        require(_settlementManager != address(0), "Pool: Settlement Manager address cannot be zero");
        settlementManager = _settlementManager;
    }

    function initiateCross(address token) external onlyFiberRouter returns (uint256 amount) {
        amount = TokenReceivable.sync(token);
    }

    function finalizeCross(
        address token,
        address recipient,
        uint256 amount
    ) external onlyFiberRouter {
        console.log("Balance Pool: %s", IERC20(token).balanceOf(address(this)));
        console.log("Amount Pool: %s", amount);
        console.log("Recipient Pool: %s", recipient);
        console.log("Token Pool: %s", token);
        TokenReceivable.sendToken(token, recipient, amount);
    }

    function rebalance(
        address token,
        uint64[] calldata targetChainSelectors,
        uint256[] calldata amounts
    ) external payable onlyLiquidityManager {
        require(targetChainSelectors.length == amounts.length, "Pool: Array length mismatch");
        for (uint256 i = 0; i < targetChainSelectors.length; i++) {
            _bridgeWithCcip(targetChainSelectors[i], token, amounts[i]);
        }
    }

    function _bridgeWithCcip(
        uint64 ccipChainSelector,
        address foundryToken,
        uint256 amount
    ) internal {

        Client.EVMTokenAmount[] memory tokenAmounts = new Client.EVMTokenAmount[](1);
        tokenAmounts[0] = Client.EVMTokenAmount({
            token: foundryToken,
            amount: amount
        });

        Client.EVM2AnyMessage memory evm2AnyMessage = Client.EVM2AnyMessage({
            receiver: abi.encode(trustedRemotePools[ccipChainSelector]), // ABI encoded remote pool address
            data: "",
            tokenAmounts: tokenAmounts,
            extraArgs: Client._argsToBytes(
                Client.EVMExtraArgsV1({gasLimit: 40000}) // Hardcode 40k gas limit for _ccipReceive
            ),
            feeToken: address(0) // zero address = pay fees with native
        });

        uint256 fees = IRouterClient(i_ccipRouter).getFee(ccipChainSelector, evm2AnyMessage);

        IERC20(foundryToken).approve(i_ccipRouter, amount);
        IRouterClient(i_ccipRouter).ccipSend{value: fees}(ccipChainSelector, evm2AnyMessage);
    }

    function _ccipReceive(Client.Any2EVMMessage memory any2EvmMessage) internal override {
        require(trustedRemotePools[any2EvmMessage.sourceChainSelector] == abi.decode(any2EvmMessage.sender, (address)), "Pool: Remote pool not trusted");
        TokenReceivable.sync(any2EvmMessage.destTokenAmounts[0].token);
    }

    /**
     * @dev Adds liquidity for the specified token.
     * @param token Token address for liquidity.
     * @param amount Amount of tokens to be added.
     */
    function addLiquidity(address token, uint256 amount) external {
        require(amount != 0, "FM: Amount must be positive");
        require(token != address(0), "FM: Bad token");
        liquidities[token][msg.sender] += amount;
        amount = SafeAmount.safeTransferFrom(
            token,
            msg.sender,
            address(this),
            amount
        );
        amount = TokenReceivable.sync(token);

        emit LiquidityAdded(msg.sender, token, amount);
    }

    function addTrustedRemotes(
        uint64[] calldata remoteCcipChainSelectors,
        address[] calldata remotePools
    ) external onlyOwner {
        require(remoteCcipChainSelectors.length == remotePools.length, "FR: Array length mismatch");
        for (uint256 i = 0; i < remoteCcipChainSelectors.length; i++) {
            require(remoteCcipChainSelectors[i] != 0, "FR: Chain ID cannot be zero");
            require(remotePools[i] != address(0), "FR: Remote pool address cannot be zero");
            trustedRemotePools[remoteCcipChainSelectors[i]] = remotePools[i];
        }
    }

    function removeTrustedRemotes(uint64[] calldata remoteCcipChainSelectors) external onlyOwner {
        for (uint256 i = 0; i < remoteCcipChainSelectors.length; i++) {
            delete trustedRemotePools[remoteCcipChainSelectors[i]];
        }
    }

    /**
     * @dev Removes possible liquidity for the specified token.
     * @param token Token address for liquidity removal.
     * @param amount Amount of tokens to be removed.
     */
    function removeLiquidityIfPossible(address token, uint256 amount) external {
        require(amount != 0, "FM: Amount must be positive");
        require(token != address(0), "FM: Bad token");

        uint256 liq = liquidities[token][msg.sender];
        require(liq >= amount, "FM: Amount exceeds user balance");

        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 withdrawAmount = balance > amount ? amount : balance;

        if (withdrawAmount > 0) {
            liquidities[token][msg.sender] -= withdrawAmount;
            TokenReceivable.sendToken(token, msg.sender, withdrawAmount);
            emit LiquidityRemoved(msg.sender, token, amount);
        }
    }

    function setFiberRouter(address _fiberRouter) external onlyOwner {
        require(_fiberRouter != address(0), "FM: Fiber Router address cannot be zero");
        fiberRouter = _fiberRouter;
    }

    function setSettlementManager(address _settlementManager) external onlyOwner {
        require(_settlementManager != address(0), "FM: Settlement Manager address cannot be zero");
        settlementManager = _settlementManager;
    }
}
