// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IForeVerifiers is IERC721{
    function decreasePower(uint256 id, uint256 amount) external;

    function protocol() external view returns (address);

    function height() external view returns (uint256);

    function increasePower(uint256 id, uint256 amount) external;

    function mintWithPower(address to, uint256 amount) external;

    function initialPowerOf(uint256 id) external view returns(uint256);

    function powerOf(uint256 id) external view returns (uint256);

    function burn(uint256 tokenId) external;
}
