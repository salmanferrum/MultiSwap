// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;


interface IInterchainTokenService {
    /**
     * @notice Initiates an interchain call contract with interchain token to a destination chain.
     * @param tokenId The unique identifier of the token to be transferred.
     * @param destinationChain The destination chain to send the tokens to.
     * @param destinationAddress The address on the destination chain to send the tokens to.
     * @param amount The amount of tokens to be transferred.
     * @param data Additional data to be passed along with the transfer.
     */
    function callContractWithInterchainToken(
        bytes32 tokenId,
        string calldata destinationChain,
        bytes calldata destinationAddress,
        uint256 amount,
        bytes calldata data,
        uint256 gasValue
    ) external payable;
}