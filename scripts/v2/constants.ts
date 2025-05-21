import { ethers } from "ethers";

export const incentives = {
  foreToken: {
    predictionDiscountRate: 1000,
    marketCreatorDiscountRate: 1000,
    verificationDiscountRate: 0,
    foundationDiscountRate: 1000,
    marketCreationFee: ethers.utils.parseEther("10"),
    verifiersNFTMultiplier: 10000,
  },
  usdt: {
    predictionDiscountRate: 1000,
    marketCreatorDiscountRate: 1000,
    verificationDiscountRate: 0,
    foundationDiscountRate: 1000,
    marketCreationFee: ethers.utils.parseEther("10"),
    verifiersNFTMultiplier: 1000,
  },
};

export const contractAddresses = {
  /// @note: These are all staging contract addresses
  arbitrumTestnet: {
    accessManager: "0x579A9b32519035495D99B01be8b4B2d14e4d70f9",
    protocol: "0x06e2cff183F7316acc3F1a8f767fd0a4752A7a98",
    protocolConfig: "0x7C82957686C00aCCf0c4CF2fbd9039EdCf84aE7d",
    foreToken: "0x0B34793E6E996aA34031d29f4b62b2e9ad684B4A",
    mockUsdt: "0x7b092Da900Bcaf79F8228966Eb4f345945bf4645",
    tokenRegistry: "0x3AB4Be953F07D92C771ef8705b5981Df707e9D40",
    factory: "0xd78925b903fB105588E564D5A6ef0Bc6234C9287",
    marketLib: "0xD00c993bdC8483AD944baDADF56D00805B2FA5c7",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    router: "0x7591A6e14569b01C05F7a9813513EdaEA5f075b5",
    accountWhitelist: "0xC72cAfC16D2844344BE10Ff21Fc90C9e4b1fCAD1",
    marketplace: "0x71307c8B00672127A9DDCC1eD4046a48598330F6",
    foreVerifiers: "0x54D7C1BC7892C579A3F62AeBb67e96eCc0FCa313",
    verifiersNFTHelper: "0x14A0871B1eD9348541FEE0d415abb7Ef098C1462",
    governorDelegate: "0xD626657f577A12E9362B36E3125fD7Ff9e176C79",
    governorDelegator: "0x8E3384A585888E4FB062D96B6d230684892E6C0f",
    timelock: "0xA61Bbc84c29Ea25F56Cc37aC0c0EA1a5A539F996",
  },
  arbitrum: {
    accessManager: "0xC75e8792E23c26432d29798bE32DB4a122D10ae9",
    protocol: "",
    protocolConfig: "",
    tokenRegistry: "0xf408c89d6256f0A6F602620AB9ab772C3E12a471",
    accountWhitelist: "0x838F8fee7DF6b14C66d8a4D7bECc8ebb4e0431f9",
    router: "0xFE04c1133b8333abb631f33520642b50fA6dD491",
    factory: "0x85C0672AB6E07979C4d9FaC086980D100071ba2e",
    foreToken: "0xcbe94d75ec713b7ead84f55620dc3174beeb1cfe",
    usdt: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    marketLib: "0x6a06B1C22E25189DFCcbaE8b7666240FfeD9F794",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    marketplace: "0x50761dA72Ea7220325936b6E17F10df71C067717",
    foreVerifiers: "0x8A86953F8D1cdB5A58dc8baD4c02484d6ac3FBaD",
    categoricalMarketBeacon: "0x7ae8C752675CDB3C79101b0E83c8B38630fBCf23",
    classicMarketBeacon: "0xaeB49565e4EBeB473e252E44cB8a27295F8191C5",
    governorDelegate: "0x5aba7c801b677930A4a06A647Ad3F00C9EFa4793",
    governorDelegator: "0x20EFdfb1757F21dFd3E5EfA3B0d2FAf9F0F263C1",
    timelock: "0x2d9a7fedD2b33e28E4E133590fA215CB28Bc748e",
  },
};
