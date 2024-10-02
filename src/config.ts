// ====================================================
// ========= Testnet configuration for pion-1 =========
// ====================================================
export const MINTER_ADDRESS =
  "neutron1txq2q76veh5j0yxv308vr4etej996vvmnsux08ltl03jmwa27cjseldg28";
export const AMM_ADDRESS =
  "neutron16n4wghx4leskv95r48sx603vcg44ussrtuz9x4v4lah3vvnmlxeqzjl7vf";
export const ROUTER_ADDRESS =
  "neutron1a9vwa9t3np6wlcwhz4rfzyrkmuj8r389whyshh4ypm6l0s2pzkmqt224zg";

export const TRACKED_DENOMS: string[] = [
  "factory/neutron1txq2q76veh5j0yxv308vr4etej996vvmnsux08ltl03jmwa27cjseldg28/P/240906/xyk/5m/wstETH/axlWETH",
  "factory/neutron1txq2q76veh5j0yxv308vr4etej996vvmnsux08ltl03jmwa27cjseldg28/Y/240906/xyk/5m/wstETH/axlWETH",
  "factory/neutron1txq2q76veh5j0yxv308vr4etej996vvmnsux08ltl03jmwa27cjseldg28/P/240913/xyk/5m/wstETH/axlWETH",
  "factory/neutron1txq2q76veh5j0yxv308vr4etej996vvmnsux08ltl03jmwa27cjseldg28/Y/240913/xyk/5m/wstETH/axlWETH",
  "factory/neutron1txq2q76veh5j0yxv308vr4etej996vvmnsux08ltl03jmwa27cjseldg28/P/241006/xyk/5m/wstETH/axlWETH",
  "factory/neutron1txq2q76veh5j0yxv308vr4etej996vvmnsux08ltl03jmwa27cjseldg28/Y/241006/xyk/5m/wstETH/axlWETH",
];

export const POINTS_MULTIPLIERS: Record<string, bigint> = {};

export const START_BLOCK = 18538216;

export const POINTS_PER_BLOCK = 1_000_000_000;
