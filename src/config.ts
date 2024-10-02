// ====================================================
// ========= Testnet configuration for pion-1 =========
// ====================================================
export const MINTER_ADDRESS =
  "neutron1txq2q76veh5j0yxv308vr4etej996vvmnsux08ltl03jmwa27cjseldg28";
export const AMM_ADDRESS =
  "neutron16n4wghx4leskv95r48sx603vcg44ussrtuz9x4v4lah3vvnmlxeqzjl7vf";
export const ROUTER_ADDRESS =
  "neutron1a9vwa9t3np6wlcwhz4rfzyrkmuj8r389whyshh4ypm6l0s2pzkmqt224zg";

export const FILTERED_ADDRESSES = [MINTER_ADDRESS, AMM_ADDRESS, ROUTER_ADDRESS];

export type Token = {
  denom: string;
  type: TokenType;
  multiplier: bigint;
  maturity: number;
};

export enum TokenType {
  Principal = "Principal",
  Yield = "Yield",
  StakedYield = "StakedYield",
  LP = "LP",
}

export const TRACKED_DENOMS: Token[] = [
  {
    denom: "factory/neutron1txq2q76veh5j0yxv308vr4etej996vvmnsux08ltl03jmwa27cjseldg28/P/240906/xyk/5m/wstETH/axlWETH",
    type: TokenType.Principal,
    multiplier: BigInt(1),
    maturity: 1725638534,
  },
  {
    denom: "factory/neutron1txq2q76veh5j0yxv308vr4etej996vvmnsux08ltl03jmwa27cjseldg28/Y/240906/xyk/5m/wstETH/axlWETH",
    type: TokenType.Yield,
    multiplier: BigInt(1),
    maturity: 1725638534,
  },
  {
    denom: "staked-factory/neutron1txq2q76veh5j0yxv308vr4etej996vvmnsux08ltl03jmwa27cjseldg28/Y/240906/xyk/5m/wstETH/axlWETH",
    type: TokenType.StakedYield,
    multiplier: BigInt(1),
    maturity: 1725638534,
  },
  {
    denom: "factory/neutron1txq2q76veh5j0yxv308vr4etej996vvmnsux08ltl03jmwa27cjseldg28/P/240913/xyk/5m/wstETH/axlWETH",
    type: TokenType.Principal,
    multiplier: BigInt(1),
    maturity: 1726243334,
  },
  {
    denom: "factory/neutron1txq2q76veh5j0yxv308vr4etej996vvmnsux08ltl03jmwa27cjseldg28/Y/240913/xyk/5m/wstETH/axlWETH",
    type: TokenType.Yield,
    multiplier: BigInt(1),
    maturity: 1726243334,
  },
  {
    denom: "staked-factory/neutron1txq2q76veh5j0yxv308vr4etej996vvmnsux08ltl03jmwa27cjseldg28/Y/240913/xyk/5m/wstETH/axlWETH",
    type: TokenType.StakedYield,
    multiplier: BigInt(1),
    maturity: 1726243334,
  },
  {
    denom: "factory/neutron1txq2q76veh5j0yxv308vr4etej996vvmnsux08ltl03jmwa27cjseldg28/P/241006/xyk/5m/wstETH/axlWETH",
    type: TokenType.Principal,
    multiplier: BigInt(1),
    maturity: 1728230534,
  },
  {
    denom: "factory/neutron1txq2q76veh5j0yxv308vr4etej996vvmnsux08ltl03jmwa27cjseldg28/Y/241006/xyk/5m/wstETH/axlWETH",
    type: TokenType.Yield,
    multiplier: BigInt(1),
    maturity: 1728230534,
  },
  {
    denom: "staked-factory/neutron1txq2q76veh5j0yxv308vr4etej996vvmnsux08ltl03jmwa27cjseldg28/Y/241006/xyk/5m/wstETH/axlWETH",
    type: TokenType.StakedYield,
    multiplier: BigInt(1),
    maturity: 1728230534,
  },
];

export const START_BLOCK = 18538216;

export const POINTS_PER_BLOCK = 1_000_000_000;
