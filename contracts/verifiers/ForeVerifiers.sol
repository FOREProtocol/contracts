// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../IForeMarkets.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";

contract ForeVerifiers is
    ERC721,
    ERC721Burnable,
    Ownable
{
    using Strings for uint256;

    error FactoryAlreadySet();
    error TokenNotExists();
    error OnlyFactoryAllowed();
    error OnlyMarketAllowed();
    error NothingToWithdraw();
    error AmountExceedLimit(uint256 limit);
    error TransferAllowedOnlyForOperator();
    error NotAuthorized();

    event FactoryChanged(IForeMarkets addr);
    event TransferAllowanceChanged(bool status);
    event TokenPowerIncreased(uint id, uint powerDelta, uint newPower);
    event TokenPowerDecreased(uint id, uint powerDelta, uint newPower);


    /// @notice Markets factory contract
    IForeMarkets internal _factory;

    /// @dev Tokens counter
    uint256 internal _height;

    /// @notice Current token power (may be reduced / increased)
    mapping(uint256 => uint256) internal _power;

    /// @notice Inital power
    mapping(uint256 => uint256) internal _initialPower;

    /// @notice Transfers may be restricted to operators
    bool internal _transfersAllowed;


    constructor()
        ERC721("ForeNFT", "FORE")
    {}


    /**
     * @notice Transfers may be restricted to operators
     */
    function transfersAllowed() external view returns (bool) {
        return _transfersAllowed;
    }

    /**
     * @notice Tokens counter
     */
    function height() external view returns (uint256) {
        return _height;
    }

    /**
     * @notice Returns current power of token
     */
    function powerOf(uint256 id) external view returns (uint256) {
        return _power[id];
    }

    /**
     * @notice Returns initial power of token
     */
    function initialPowerOf(uint256 id) external view returns (uint256) {
        return _initialPower[id];
    }

    /**
     * @notice Returns market factory contract address
     */
    function factory() external view returns (address) {
        return address(_factory);
    }

    /**
     * @inheritdoc ERC721
     */
    function _baseURI()
        internal
        pure
        override
        returns (string memory)
    {
        return "https://nft.api.foreprotocol.io/token/";
    }

    /**
     * @notice Changes factory contract
     * @param addr New contract
     */
    function setFactory(IForeMarkets addr)
        external
        onlyOwner
    {
        if (address(_factory) != address(0)) {
            revert FactoryAlreadySet();
        }

        _factory = addr;

        emit FactoryChanged(addr);
    }

    /**
     * @notice Changes transferability feature
     * @param status Status
     */
    function setTransferAllowance(bool status)
        external
        onlyOwner
    {
        _transfersAllowed = status;

        emit TransferAllowanceChanged(status);
    }

    /**
     * @notice Mints token with defined power
     * @param to Recipient
     * @param power Power
     */
    function mintWithPower(
        address to,
        uint256 power
    )
        external
    {
        if (address(_factory) != msg.sender) {
            revert OnlyFactoryAllowed();
        }

        _power[_height] = power;
        _initialPower[_height] = power;

        _safeMint(to, _height);

        _height++;
    }

    /**
     * @notice Increase token power
     * @param id Token Id
     * @param powerDelta Power delta
     */
    function increasePower(
        uint256 id,
        uint256 powerDelta
    )
        external
    {
        if (!_exists(id)) {
            revert TokenNotExists();
        }
        if (!_factory.isForeMarket(msg.sender)) {
            revert OnlyMarketAllowed();
        }

        _power[id] += powerDelta;

        emit TokenPowerIncreased(id, powerDelta, _power[id]);
    }

    /**
     * @notice Decrease token power (f.e. penalty)
     * @param id Token Id
     * @param powerDelta Power delta
     */
    function decreasePower(
        uint256 id,
        uint256 powerDelta
    )
        external
    {
        if (!_exists(id)) {
            revert TokenNotExists();
        }
        if (powerDelta == 0) {
            revert NothingToWithdraw();
        }

        uint256 currentPower = _power[id];

        // limit withdraw value
        uint256 maxAmount = 0;

        if (_factory.isForeMarket(msg.sender)) {
            // market can ultimately reduce power
            maxAmount = currentPower;
        }
        else if (ownerOf(id) == msg.sender) {
            // user can withdraw only value larger than initial power
            maxAmount = currentPower > _initialPower[id]
                ? currentPower - _initialPower[id]
                : 0;
        }
        else {
            // different user can't withdraw
            revert NotAuthorized();
        }

        if (powerDelta > maxAmount) {
            revert AmountExceedLimit(maxAmount);
        }

        currentPower -= powerDelta;
        _power[id] = currentPower;

        if (currentPower == 0) {
            _burn(id);
        }

        IERC20 foreToken = IERC20(_factory.foreToken());
        foreToken.transfer(msg.sender, powerDelta);

        emit TokenPowerDecreased(id, powerDelta, _power[id]);
    }

    /**
     * @inheritdoc ERC721
     * @dev It is always allowed for Fore operator
     */
    function isApprovedForAll(address owner, address operator)
        public
        view
        override
        returns (bool)
    {
        if (_factory.isForeOperator(operator)) {
            return true;
        }

        return super.isApprovedForAll(owner, operator);
    }

    /**
     * @inheritdoc ERC721
     * @dev In case transfers are disabled only Fore operator is allowed to transfer from or transfer to
     */
    function _transfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override {
        if (!_transfersAllowed) {
            if (
                !_factory.isForeOperator(to)
                && !_factory.isForeOperator(from)
            ) {
                revert TransferAllowedOnlyForOperator();
            }
        }

        super._transfer(from, to, tokenId);
    }

    /**
     * @inheritdoc ERC721
     */
    function _burn(uint256 tokenId) internal virtual override {
        _power[tokenId] = 0;
        super._burn(tokenId);
    }

}
