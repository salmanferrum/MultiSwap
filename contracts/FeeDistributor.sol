// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

abstract contract FeeDistributor is EIP712, Ownable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    string public constant NAME = "FEE_DISTRIBUTOR";
    string public constant VERSION = "000.001";
    uint32 constant MINUTE = 60;
    address public constant GENERAL_REFERRAL_KEY = address(1);

    address public feeWallet;
    uint256 public platformFee; // Platform fee as a fixed amount
    uint48 public defaultReferralShare;
    uint48 public defaultReferralDiscount;

    mapping(bytes32 => bool) public usedSalt;
    mapping(address => ReferralData) public referrals;
    mapping(address => address) public firstUsedCode; // userAddress => referralCode

    bytes32 constant REFERRAL_CODE_TYPEHASH = keccak256(
        "ReferralSignature(bytes32 salt,uint256 expiry)"
    );

    struct ReferralData {
        address referral;
        uint48 referralShare;
        uint48 referralDiscount;
        address[] users;
    }

    event ReferralAdded(
        address referral,
        uint48 referralShare,
        uint48 referralDiscount,
        address publicReferralCode
    );

    event ReferralRemoved(
        address referral,
        uint48 referralShare,
        uint48 referralDiscount,
        address publicReferralCode
    );

    event FeesDistributed(
        address token,
        address referral,
        uint256 preFeeAmount,
        uint256 totalFee
    );

    constructor() EIP712(NAME, VERSION) {
        defaultReferralShare = 50;
        defaultReferralDiscount = 50;
    }

    //#############################################################
    //################ USER FUNCTIONS #############################
    //#############################################################

    /**
     * @notice Allows anyone to create a new unique referral code
     * with a 50% share and 50% discount (current defaul values)
     * @param referralCode The referral to generate data for
     */
    function createReferralCode(
        address referralCode
    ) external {
        require(referralCode != address(0), "FD: Bad referral code");
        require(referrals[referralCode].referral == address(0), "FD: Already existing code");
        referrals[referralCode] = ReferralData(msg.sender, defaultReferralShare, defaultReferralDiscount, new address[](0));
    }

    //#############################################################
    //################ ADMIN FUNCTIONS ############################
    //#############################################################

    /**
     * @dev Sets the fee wallet.
     * @param _feeWallet The new fee wallet address.
     */
    function setFeeWallet(address _feeWallet) external onlyOwner {
        require(_feeWallet != address(0), "FD: Bad fee wallet address");
        feeWallet = _feeWallet;
    }

    /**
     * @dev Sets the platform fee.
     * @param _platformFee The new platform fee as a fixed amount.
     */
    function setPlatformFee(uint256 _platformFee) external onlyOwner {
        require(_platformFee > 0, "FD: Platform fee must be greater than zero");
        platformFee = _platformFee;
    }

    /**
     * @param _defaultReferralShare The default referral share percentage.
     * @param _defaultReferralDiscount The default referral discount percentage.
     */
    function setDefaultReferralData(uint48 _defaultReferralShare, uint48 _defaultReferralDiscount) external onlyOwner {
        require(_defaultReferralShare > 0 && _defaultReferralShare <= 100, "FD: Invalid referral fee");
        require(_defaultReferralDiscount > 0 && _defaultReferralDiscount <= 100, "FD: Invalid referral discount");
        defaultReferralShare = _defaultReferralShare;
        defaultReferralDiscount = _defaultReferralDiscount;
    }

    /**
     * @dev Adds a new referral to the contract.
     * @param referral The address of the referral.
     * @param referralShare The percentage share of the referral (must be between 1 and 100).
     * @param referralDiscount The discount percentage provided by the referral.
     * @param publicReferralCode The address associated with the referral code.
     */
    function addReferral(
        address referral,
        uint48 referralShare,
        uint48 referralDiscount,
        address publicReferralCode,
        address[] memory users
    ) external onlyOwner {
        require(referral != address(0), "FD: Bad referral address");
        require(
            referralShare > 0 && referralShare <= 100,
            "FD: Invalid referral fee"
        ); // Has to be between 1 and 100%
        referrals[publicReferralCode] = ReferralData(
            referral,
            referralShare,
            referralDiscount,
            users
        );
    }

    /**
     * @dev Removes an existing referral from the contract.
     * @param publicReferralCode The address associated with the referral code to be removed.
     */
    function removeReferral(address publicReferralCode) external onlyOwner {
        delete referrals[publicReferralCode];
    }
    
    //#############################################################
    //################ INTERNAL LOGIC FUNCTIONS ###################
    //#############################################################

    /**
     * @dev Internal function to distribute fees, considering referral data.
     * @param user The address of the user initiating the transaction.
     * @param token The address of the token in which fees are paid.
     * @param preFeeAmount The amount before fees are deducted.
     * @param refSigData The referral signature data.
     * @return The amount after fees are deducted.
     */
    function _distributeFees(
        address user,
        address token,
        uint256 preFeeAmount,
        bytes memory refSigData
    ) internal returns (uint256) {
        ReferralData memory referralData;

        // Check if the user already has a saved referral code
        if (firstUsedCode[user] != address(0)) {
            referralData = referrals[firstUsedCode[user]];
        } else if (refSigData.length != 0) {
            // If refSigData is provided, validate and set the referral code
            referralData = _getReferralData(user, refSigData);
        } else {
            // No referral code; use default
            referralData = referrals[address(0)];
        }

        uint256 totalFee = platformFee;
        if (totalFee > 0) {
            if (referralData.referral == address(0)) {
                // No or invalid referral code
                IERC20(token).safeTransfer(feeWallet, totalFee);
            } else {
                // Apply referral discount
                totalFee -= (totalFee * referralData.referralDiscount) / 100;
                uint256 referralShare = (totalFee * referralData.referralShare) / 100;
                uint256 platformShare = totalFee - referralShare;
                IERC20(token).safeTransfer(feeWallet, platformShare);
                IERC20(token).safeTransfer(referralData.referral, referralShare);
            }
        }

        emit FeesDistributed(token, referralData.referral, preFeeAmount, totalFee);
        return preFeeAmount - totalFee;
    }

    /**
     * @dev Internal function to get referral data, ensuring the user's first valid referral code is used.
     * @param user The address of the user.
     * @param refSigData The referral signature data.
     * @return The referral data associated with the user.
     */
    function _getReferralData(address user, bytes memory refSigData) private returns (ReferralData memory) {
        (bytes32 salt, uint256 expiry, bytes memory signature) = abi.decode(
            refSigData,
            (bytes32, uint256, bytes)
        );

        require(block.timestamp < expiry, "FD: Signature timed out");
        require(expiry < block.timestamp + (3 * MINUTE), "FD: Expiry too far");
        require(!usedSalt[salt], "FD: Salt already used");
        usedSalt[salt] = true;

        bytes32 structHash = keccak256(
            abi.encode(REFERRAL_CODE_TYPEHASH, salt, expiry)
        );

        bytes32 digest = _hashTypedDataV4(structHash);
        address referralCode = ECDSA.recover(digest, signature);

        // Ensure the referral code exists
        if (referrals[referralCode].referral == address(0)) {
            // If the referral code does not exist, use the general referral code
            return referrals[address(0)];
        } else {
            // If it exsists, save the referral code
            firstUsedCode[user] = referralCode;
            return referrals[referralCode];
        }
    }
}
