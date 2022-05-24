// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ForeVesting is
    Ownable
{

    error ArrayLengthsMismatch(uint256 length);
    error InsufficientBalanceOrAllowance(uint256 required);
    error VestingNotFound();
    error VestingNotStartedYet();


    struct Vesting {
        /// @notice Vesting amount
        uint256 vestingAmount;

        /// @notice Remaining (non vested) amount
        uint256 vestingRemaining;

        /// @notice Activation amount
        uint256 activationAmount;

        /// @notice Beginning of linear vesting
        uint256 timestampStart;

        /// @notice Ending of linear vesting
        uint256 timestampEnd;
    }

    /// @notice FORE ERC20 token
    IERC20 internal _token;

    /// @notice List of vestings
    /// @dev address => index => Vesting
    mapping(address => mapping(uint256 => Vesting)) internal _vesting;

    /// @notice Number of vestings for each account
    mapping(address => uint256) internal _slotsOf;


    constructor(IERC20 _tokenContractAddress) {
        _token = _tokenContractAddress;
    }

    /**
     * @notice Number of vestings for each account
     * @param _address Account
     */
    function slotsOf(address _address) external view returns (uint256) {
        return _slotsOf[_address];
    }

    /**
     * @notice Returns vesting information
     * @param _address Account
     * @param _slot Slot index
     */
    function vestingInfo(address _address, uint256 _slot)
        external
        view
        returns (Vesting memory)
    {
        return _vesting[_address][_slot];
    }

    /**
     * @dev Internal function. Calculates amount available to claim
     */
    function _availableVesting(Vesting memory v)
        internal
        view
        returns (uint256)
    {
        if (v.vestingAmount == 0) {
            return 0;
        }
        if (block.timestamp <= v.timestampStart) {
            return 0;
        }
        if (block.timestamp >= v.timestampEnd) {
            return v.vestingRemaining;
        }

        uint256 sharePerSecond = v.vestingAmount / (v.timestampEnd - v.timestampStart);
        uint256 maximumPayout = sharePerSecond * (block.timestamp - v.timestampStart);
        uint256 withdrawnAmount = v.vestingAmount - v.vestingRemaining;

        return maximumPayout >= withdrawnAmount
            ? (maximumPayout - withdrawnAmount)
            : 0;
    }

    /**
     * @notice Returns amount available to claim
     * @param _address Owner account
     * @param _slot Vesting slot
     */
    function available(
        address _address,
        uint256 _slot
    )
        external
        view
        returns (uint256)
    {
        Vesting memory v = _vesting[_address][_slot];
        return v.vestingRemaining == v.vestingAmount
            ? (_availableVesting(v) + v.activationAmount)
            : _availableVesting(v);
    }

    /**
     * @notice Adds vesting informations
     * @param _addresses Addresses
     * @param _amounts Amounts
     * @param _timestampStart Start timestamps
     * @param _timestampEnd End timestamps
     * @param _initialUnlock Intially unlocked amounts
     */
    function addAddresses(
        address[] memory _addresses,
        uint256[] memory _amounts,
        uint256[] memory _timestampStart,
        uint256[] memory _timestampEnd,
        uint256[] memory _initialUnlock
    )
        external
        onlyOwner
    {
        uint256 len = _addresses.length;
        if (
            len != _amounts.length
            || len != _timestampStart.length
            || len != _timestampEnd.length
            || len != _initialUnlock.length
        ) {
            revert ArrayLengthsMismatch(len);
        }

        uint256 tokensSum;
        for (uint256 i = 0; i < len; i++) {
            uint256 vestingNum = _slotsOf[_addresses[i]];
            _slotsOf[_addresses[i]]++;
            tokensSum += _amounts[i];

            Vesting memory v = Vesting(
                _amounts[i],
                _amounts[i],
                _initialUnlock[i],
                _timestampStart[i],
                _timestampEnd[i]
            );
            _vesting[_addresses[i]][vestingNum] = v;
        }

        if (
            _token.balanceOf(msg.sender) < tokensSum
            || _token.allowance(msg.sender, address(this)) < tokensSum
        ) {
            revert InsufficientBalanceOrAllowance(tokensSum);
        }

        _token.transferFrom(msg.sender, address(this), tokensSum);
    }

    /**
     * @notice Withdraws available amount
     * @param _slot Vesting slot
     */
    function withdraw(uint256 _slot) external
    {
        Vesting storage v = _vesting[msg.sender][_slot];

        if (v.vestingAmount == 0) {
            revert VestingNotFound();
        }
        if (block.timestamp < v.timestampStart) {
            revert VestingNotStartedYet();
        }

        uint256 toWithdraw = _availableVesting(v);
        v.vestingRemaining -= toWithdraw;

        if (v.vestingRemaining == v.vestingAmount) {
            toWithdraw += v.activationAmount;
        }

        _token.transfer(msg.sender, toWithdraw);
    }

}
