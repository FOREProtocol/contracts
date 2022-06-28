// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "./ForeMarket.sol";
import "./verifiers/IForeVerifiers.sol";
import "./config/IProtocolConfig.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

contract ForeMarkets is ERC721, ERC721Enumerable, ERC721Burnable {
    using Strings for uint256;

    error MarketAlreadyExists();

    event MarketCreated(
        address indexed creator,
        bytes32 marketHash,
        address market,
        uint256 marketIdx
    );

    /// @notice Init creatin code
    /// @dev Needed to calculate market address
    bytes32 public constant INIT_CODE_PAIR_HASH =
        keccak256(abi.encodePacked(type(ForeMarket).creationCode));

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
    function isForeOperator(address addr) external view returns (bool) {
        return (addr != address(0) &&
            (addr == address(this) ||
                isForeMarket[addr] ||
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
    /// @param receiver market creator nft receiver
    /// @param amountA initial prediction for side A
    /// @param amountB initial prediction for side B
    /// @param endPredictionTimestamp End predictions unix timestamp
    /// @param startVerificationTimestamp Start Verification unix timestamp
    /// @return createdMarket Address of created market
    function createMarket(
        bytes32 marketHash,
        address receiver,
        uint256 amountA,
        uint256 amountB,
        uint64 endPredictionTimestamp,
        uint64 startVerificationTimestamp
    ) external returns (address createdMarket) {
        if (market[marketHash] != address(0)) {
            revert MarketAlreadyExists();
        }

        if (endPredictionTimestamp > startVerificationTimestamp) {
            revert("ForeMarkets: Date error");
        }

        uint256 creationFee = config.marketCreationPrice();
        if (creationFee != 0) {
            foreToken.burnFrom(msg.sender, creationFee);
        }

        bytes memory bytecode = type(ForeMarket).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(marketHash));
        assembly {
            createdMarket := create2(
                0,
                add(bytecode, 32),
                mload(bytecode),
                salt
            )
            if iszero(extcodesize(createdMarket)) {
                revert(0, 0)
            }
        }

        uint256 amountSum = amountA + amountB;
        if (amountSum != 0) {
            foreToken.transferFrom(msg.sender, createdMarket, amountSum);
        }

        uint256 marketIdx = allMarkets.length;
        ForeMarket(createdMarket).initialize(
            marketHash,
            receiver,
            amountA,
            amountB,
            endPredictionTimestamp,
            startVerificationTimestamp,
            uint64(marketIdx)
        );

        market[marketHash] = createdMarket;
        isForeMarket[createdMarket] = true;

        _mint(receiver, marketIdx);
        emit MarketCreated(msg.sender, marketHash, createdMarket, marketIdx);

        allMarkets.push(createdMarket);
    }
}
