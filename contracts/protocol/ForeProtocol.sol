// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "../verifiers/IForeVerifiers.sol";
import "./config/IProtocolConfig.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "../token/IERC20Burnable.sol";
import "./IForeProtocol.sol";

contract ForeProtocol is ERC721, ERC721Enumerable, ERC721Burnable {
    using Strings for uint256;

    error MarketAlreadyExists();
    error FactoryIsNotWhitelisted();

    event MarketCreated(
        address indexed creator,
        bytes32 marketHash,
        address market,
        uint256 marketIdx,
        uint8 marketType
    );

    /// @notice ForeToken
    IERC20Burnable public immutable foreToken;

    /// @notice Protocol Config
    IProtocolConfig public immutable config;

    /// @notice ForeVerifiers
    IForeVerifiers public immutable foreVerifiers;

    /// @notice Market address for hash (ipfs hash without first 2 bytes)
    mapping(bytes32 => address) public market;

    /// @notice True if address is ForeMarket
    mapping(address => bool) public isForeMarket;

    /// @notice All markets array
    address[] public allMarkets;

    /// @param cfg Protocol Config address
    constructor(IProtocolConfig cfg) ERC721("Fore Markets", "MFORE") {
        config = cfg;
        foreToken = IERC20Burnable(cfg.foreToken());
        foreVerifiers = IForeVerifiers(cfg.foreVerifiers());
    }

    /// @notice Returns base uri
    function _baseURI() internal pure override returns (string memory) {
        return "https://markets.api.foreprotocol.io/market/";
    }

    /// @notice Returns token uri for existing token
    function tokenURI(uint256 tokenId)
        public
        view
        virtual
        override
        returns (string memory)
    {
        require(tokenId < allMarkets.length, "Non minted token");
        return string(abi.encodePacked(_baseURI(), tokenId.toString()));
    }

    /// @notice Returns true if Address is ForeOperator
    /// @dev ForeOperators: ForeMarkets(as factory), ForeMarket contracts and marketplace
    function isForeOperator(address addr) public view returns (bool) {
        return (addr != address(0) &&
            (addr == address(this) ||
                isForeMarket[addr] ||
                config.isFactoryWhitelisted(addr) ||
                addr == config.marketplace()));
    }

    function _beforeTokenTransfer(address from, address to, uint256 tokenId)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._beforeTokenTransfer(from, to, tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /// @dev Allow tokens to be used by market contracts
    function isApprovedForAll(address owner, address operator)
        public
        view
        override(ERC721)
        returns (bool)
    {
        if (isForeMarket[operator]) {
            return true;
        }
        return super.isApprovedForAll(owner, operator);
    }

    /// @notice Returns length of all markets array / nft height
    function allMarketLength() external view returns (uint256) {
        return allMarkets.length;
    }

    /// @notice Mints Verifier Nft (ForeVerifier)
    /// @param receiver receiver address
    function mintVerifier(address receiver) external {
        uint256 mintPrice = config.verifierMintPrice();
        foreToken.transferFrom(msg.sender, address(foreVerifiers), mintPrice);
        foreVerifiers.mintWithPower(receiver, mintPrice);
    }

    /// @notice Buys additional power (ForeVerifier)
    /// @param id token id
    /// @param amount amount to buy
    function buyPower(uint256 id, uint256 amount) external {
        require(
            foreVerifiers.powerOf(id) + amount <= config.verifierMintPrice(),
            "ForeFactory: Buy limit reached"
        );
        foreToken.transferFrom(msg.sender, address(foreVerifiers), amount);
        foreVerifiers.increasePower(id, amount);
    }

    /// @notice Creates Market
    /// @param marketHash market hash
    /// @param receiver Receiver of market token
    /// @param marketAddress Created market address
    /// @return marketId Created market id
    function createMarket(
        bytes32 marketHash,
        address receiver,
        address marketAddress,
        uint8 marketType
    ) external returns(uint256 marketId){
        if (market[marketHash] != address(0)) {
            revert MarketAlreadyExists();
        }

        if (!config.isFactoryWhitelisted(msg.sender)){
            revert FactoryIsNotWhitelisted();
        }

        market[marketHash] = marketAddress;
        isForeMarket[marketAddress] = true;

        uint256 marketIdx = allMarkets.length;

        _mint(receiver, marketIdx);
        emit MarketCreated(
            msg.sender,
            marketHash,
            marketAddress,
            marketIdx,
            marketType
        );

        allMarkets.push(marketAddress);

        return(marketIdx);
    }
}
