// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../IForeMarkets.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";

contract ForeVerifiers is ERC721, ERC721Burnable, Ownable {
    using Strings for uint256;
    IForeMarkets internal _factory;
    uint256 internal _height;
    mapping(uint256 => uint256) internal _power;
    mapping(uint256 => uint256) internal _initialPower;
    bool internal _transfersAllowed;

    function setTransferAllowance(bool status) external onlyOwner {
        _transfersAllowed = status;
    }

    function transfersAllowed() external view returns (bool) {
        return _transfersAllowed;
    }

    function height() external view returns (uint256) {
        return _height;
    }

    function powerOf(uint256 id) external view returns (uint256) {
        return _power[id];
    }

    function initialPowerOf(uint256 id) external view returns (uint256) {
        return _initialPower[id];
    }

    function factory() external view returns (address) {
        return address(_factory);
    }

    constructor() ERC721("ForeNFT", "FORE") {}

    function setFactory(IForeMarkets addr) external onlyOwner {
        require(
            address(_factory) == address(0),
            "ForeVerifiers: Factory is set"
        );
        _factory = addr;
    }

    function _baseURI() internal pure override returns (string memory) {
        return "https://nft.api.foreprotocol.io/token/";
    }

    function mintWithPower(address to, uint256 amount) external {
        require(address(_factory) == msg.sender, "ForeNFT: FORBIDDEN");
        _power[_height] = amount;
        _initialPower[_height] = amount;
        _safeMint(to, _height);
        _height++;
    }

    function increasePower(uint256 id, uint256 amount) external {
        require(_factory.isForeMarket(msg.sender), "ForeNFT: FORBIDDEN");
        _power[id] += amount;
    }

    function decreasePower(uint256 id, uint256 amount) external {
        uint256 pwr = _power[id];
        uint256 maxWithdrawUser = (pwr > _initialPower[_height])
            ? pwr - _initialPower[_height]
            : 0;
        uint256 maxAmount = _factory.isForeMarket(msg.sender)
            ? pwr
            : maxWithdrawUser;
        require(amount != 0, "ForeNft: Nothing to withdraw");
        require(amount <= maxAmount, "ForeNft: Amount exceed balace");
        pwr -= amount;
        _power[id] = pwr;
        if (pwr == 0) {
            _burn(id);
        }
        IERC20(_factory.foreToken()).transfer(msg.sender, amount);
    }

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

    function burn(uint256 tokenId) public virtual override {
        _power[tokenId] = 0;
        super.burn(tokenId);
    }
}
