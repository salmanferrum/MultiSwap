// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { CCIPReceiver } from '@chainlink/contracts-ccip/src/v0.8/ccip/applications/CCIPReceiver.sol';
import { Client } from "@chainlink/contracts-ccip/src/v0.8/ccip/libraries/Client.sol";
import { IRouterClient } from "@chainlink/contracts-ccip/src/v0.8/ccip/interfaces/IRouterClient.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { BaseRouter } from './BaseRouter.sol';


abstract contract CCIPApp is CCIPReceiver, BaseRouter {

    mapping(uint256 => uint256) private chainIdToCcipChainSelector;
    mapping(uint256 => uint256) private ccipChainSelectorToChainId;

    constructor(address ccipRouter) CCIPReceiver(ccipRouter) {}

    function _bridgeWithCcip(
        uint256 targetChainId,
        address foundryToken,
        uint256 amount,
        bytes memory dstCalldata
    ) internal {

        Client.EVMTokenAmount[] memory tokenAmounts = new Client.EVMTokenAmount[](1);
        tokenAmounts[0] = Client.EVMTokenAmount({
            token: foundryToken,
            amount: amount
        });

        Client.EVM2AnyMessage memory evm2AnyMessage = Client.EVM2AnyMessage({
            receiver: abi.encode(trustedRemoteRouters[targetChainId]), // ABI encoded fiberRouter address
            data: dstCalldata,
            tokenAmounts: tokenAmounts,
            extraArgs: Client._argsToBytes(
                Client.EVMExtraArgsV1({gasLimit: dstCalldata.length == 0x20 ? 150000 : 600000})
            ),
            feeToken: address(0) // zero address means native
        });

        uint256 fees = IRouterClient(i_ccipRouter).getFee(uint64(_getCcipChainSelector(targetChainId)), evm2AnyMessage);
        IERC20(foundryToken).approve(i_ccipRouter, amount);

        IRouterClient(i_ccipRouter).ccipSend{value: fees}(uint64(_getCcipChainSelector(targetChainId)), evm2AnyMessage);
    }

    function _ccipReceive(Client.Any2EVMMessage memory any2EvmMessage) internal override {
        require(trustedRemoteRouters[_getChainId(any2EvmMessage.sourceChainSelector)] == abi.decode(any2EvmMessage.sender, (address)), "CCIPApp: Router not trusted");
        
        if (any2EvmMessage.data.length == 0x20) {
            address recipient = abi.decode(any2EvmMessage.data, (address));
            _moveTokens(any2EvmMessage.destTokenAmounts[0].token, address(this), recipient, any2EvmMessage.destTokenAmounts[0].amount);
        } else if (any2EvmMessage.data.length > 0x20) {
            
        } else {
            revert("CCIPApp: Invalid data length");
        }
    }

    function setChainIdAndCcipChainSelectorPairs(uint256[] calldata chainId, uint256[] calldata ccipChainSelector) public {
        require(chainId.length == ccipChainSelector.length, "CCIPApp: chainId and ccipChainSelector length mismatch");
        for (uint256 i = 0; i < chainId.length; i++) {
            chainIdToCcipChainSelector[chainId[i]] = ccipChainSelector[i];
            ccipChainSelectorToChainId[ccipChainSelector[i]] = chainId[i];
        }
    }

    function _getChainId(uint256 ccipChainSelector) internal view returns (uint256) {
        uint256 chainId = ccipChainSelectorToChainId[ccipChainSelector];
        require(chainId != 0, "CCIPApp: chainId not set");
        return chainId;
    }

    function _getCcipChainSelector(uint256 chainId) internal view returns (uint256) {
        uint256 ccipChainSelector = chainIdToCcipChainSelector[chainId];

        require(ccipChainSelector != 0, "CCIPApp: ccipChainSelector not set");
        return ccipChainSelector;
    }
}
