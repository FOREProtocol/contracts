import { ethers } from "ethers";

export const incentives = {
  foreToken: {
    predictionDiscountRate: 1000,
    marketCreatorDiscountRate: 1000,
    verificationDiscountRate: 1000,
    foundationDiscountRate: 1000,
    marketCreationFee: ethers.utils.parseEther("10"),
  },
  usdt: {
    predictionDiscountRate: 1000,
    marketCreatorDiscountRate: 1000,
    verificationDiscountRate: 1000,
    foundationDiscountRate: 1000,
    marketCreationFee: ethers.utils.parseEther("10"),
  },
};

export const contractAddresses = {
  feeReceiver: "0x3ec4366667aeB997DE9CF4054C55fFD74D53988A",
  foreFoundationMultiSign: "0x3ec4366667aeB997DE9CF4054C55fFD74D53988A",
  foreAccessManager: "0x2B2f78c5BF6D9C12Ee1225D5F374aa91204580c3",
  protocol: "0x4936de275CFdCf84F4130441305a1027ebb1AC43",
  foreToken: "0xe9e2889d515Fd4bF764Ea927Af13Aaf974Cde21E",
  usdt: "0xE5b6C29411b3ad31C3613BbA0145293fC9957256",
  tokenRegistry: "0x6D0b0c50B07E22d8c394e73B1BBf79dB23dB0C65",
  factory: "0x323A6aE4E1e4B74221515B3205741f2Aa8D7C0FD",
  marketLib: "0x2B2f78c5BF6D9C12Ee1225D5F374aa91204580c3",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  router: "0x183BF092ECb4C0Fcc06565993663d89ce5b366E0",
};
