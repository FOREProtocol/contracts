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

/// @note: These are all staging contract addresses
export const contractAddresses = {
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
};
