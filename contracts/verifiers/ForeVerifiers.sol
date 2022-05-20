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
        require(
            address(_factory) == address(0),
            "ForeVerifiers: Factory is set"
        );

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
        require(
            address(_factory) == msg.sender,
            "ForeNFT: FORBIDDEN"
        );

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
        require(
            _factory.isForeMarket(msg.sender),
            "ForeNFT: FORBIDDEN"
        );

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
        uint256 currentPower = _power[id];

        uint256 withdrawableByUser = (currentPower > _initialPower[_height])
            ? currentPower - _initialPower[_height]
            : 0;
        uint256 maxAmount = _factory.isForeMarket(msg.sender)
            ? currentPower
            : withdrawableByUser;

        require(
            powerDelta != 0,
            "ForeNft: Nothing to withdraw"
        );

        require(
            powerDelta <= maxAmount,
            "ForeNft: Amount exceed balace"
        );

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
        require(
            (_transfersAllowed ||
                _factory.isForeOperator(to) ||
                _factory.isForeOperator(from)),
            "ForeNft: Only protocol operator"
        );
        super._transfer(from, to, tokenId);
    }

    /**
     * @inheritdoc ERC721Burnable
     */
    function burn(uint256 tokenId) public virtual override {
        _power[tokenId] = 0;
        super.burn(tokenId);
    }

}
