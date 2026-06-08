/**
 * data/featured-assets.ts — Generated curated RWA asset specs. (D23)
 *
 * Each entry is a REAL DefiLlama pool, vetted for clean current data within its
 * category's plausible band (the pipeline bounds gate). Generated from the vetted
 * pool set; mETH (two computation paths) is defined separately in source-registry.ts.
 * Honesty: every label states the source is single + issuer-derived where that is true,
 * and never uses the word "independent". The pipeline gates protect attest-time quality.
 */

import type { AssetSpec } from "./types.js";

export const GENERATED_FEATURED: AssetSpec[] = [
  {
    symbol: "USDT0",
    name: "Aave USDT0",
    verified: true,
    chain: "Mantle",
    category: "lending",
    sources: [
      {
        scheme: "defillama",
        ref: "47da0cdd-7b1d-4927-9545-20b53b73afa8",
        kind: "reportedApy",
        legName: "defillama-usdt0",
      },
    ],
    independenceLabel:
      "Aave USDT0 lending yield on Mantle. DefiLlama reported variable-rate APY. Single source.",
  },
  {
    symbol: "GHO",
    name: "Aave GHO",
    verified: true,
    chain: "Mantle",
    category: "lending",
    sources: [
      {
        scheme: "defillama",
        ref: "125974d5-ad17-4a3a-b967-ebbf721fca22",
        kind: "reportedApy",
        legName: "defillama-gho",
      },
    ],
    independenceLabel:
      "Aave GHO lending yield on Mantle. DefiLlama reported variable-rate APY. Single source.",
  },
  {
    symbol: "USDY",
    name: "Ondo USDY",
    verified: true,
    chain: "Mantle",
    category: "tokenized-treasury",
    sources: [
      {
        scheme: "defillama",
        ref: "b5d7a190-38d2-4fdd-8c14-1fd00c11bce1",
        kind: "reportedApy",
        legName: "defillama-usdy",
      },
    ],
    independenceLabel:
      "Ondo USDY (tokenized US Treasuries / money-market). DefiLlama reported APY, issuer-derived. Single source, full transparency; does not catch issuer fraud.",
  },
  {
    symbol: "LBTC",
    name: "lombard-lbtc LBTC",
    verified: true,
    chain: "Ethereum",
    category: "btc-yield",
    sources: [
      {
        scheme: "defillama",
        ref: "c9762afb-7746-4b5a-a484-a8881a348999",
        kind: "reportedApy",
        legName: "defillama-lbtc",
      },
    ],
    independenceLabel: "lombard-lbtc LBTC (BTC yield). DefiLlama reported APY. Single source.",
  },
  {
    symbol: "WEETH",
    name: "ether.fi WEETH",
    verified: true,
    chain: "Ethereum",
    category: "liquid-restaking",
    sources: [
      {
        scheme: "defillama",
        ref: "46bd2bdf-6d92-4066-b482-e885ee172264",
        kind: "reportedApy",
        legName: "defillama-weeth",
      },
    ],
    independenceLabel:
      "ether.fi WEETH (liquid restaking). DefiLlama reported APY. Single source; restaking yield varies with operators.",
  },
  {
    symbol: "RSETH",
    name: "Kelp RSETH",
    verified: true,
    chain: "Ethereum",
    category: "liquid-restaking",
    sources: [
      {
        scheme: "defillama",
        ref: "33c732f6-a78d-41da-af5b-ccd9fa5e52d5",
        kind: "reportedApy",
        legName: "defillama-rseth",
      },
    ],
    independenceLabel:
      "Kelp RSETH (liquid restaking). DefiLlama reported APY. Single source; restaking yield varies with operators.",
  },
  {
    symbol: "EZETH",
    name: "Renzo EZETH",
    verified: true,
    chain: "Ethereum",
    category: "liquid-restaking",
    sources: [
      {
        scheme: "defillama",
        ref: "e28e32b5-e356-41d9-8dc7-a376ece56619",
        kind: "reportedApy",
        legName: "defillama-ezeth",
      },
    ],
    independenceLabel:
      "Renzo EZETH (liquid restaking). DefiLlama reported APY. Single source; restaking yield varies with operators.",
  },
  {
    symbol: "EBTC",
    name: "ether.fi EBTC",
    verified: true,
    chain: "Ethereum",
    category: "liquid-restaking",
    sources: [
      {
        scheme: "defillama",
        ref: "f6568026-ff92-463d-8712-b9e8f8ea1408",
        kind: "reportedApy",
        legName: "defillama-ebtc",
      },
    ],
    independenceLabel:
      "ether.fi EBTC (liquid restaking). DefiLlama reported APY. Single source; restaking yield varies with operators.",
  },
  {
    symbol: "STETH",
    name: "Lido STETH",
    verified: true,
    chain: "Ethereum",
    category: "liquid-staking",
    sources: [
      {
        scheme: "defillama",
        ref: "747c1d2a-c668-4682-b9f9-296708a3dd90",
        kind: "reportedApy",
        legName: "defillama-steth",
      },
    ],
    independenceLabel:
      "Lido STETH (liquid staking). DefiLlama reported APY. Single source; an on-chain rate cross-check is pending.",
  },
  {
    symbol: "WBETH",
    name: "Binance WBETH",
    verified: true,
    chain: "Ethereum",
    category: "liquid-staking",
    sources: [
      {
        scheme: "defillama",
        ref: "80b8bf92-b953-4c20-98ea-c9653ef2bb98",
        kind: "reportedApy",
        legName: "defillama-wbeth",
      },
    ],
    independenceLabel:
      "Binance WBETH (liquid staking). DefiLlama reported APY. Single source; an on-chain rate cross-check is pending.",
  },
  {
    symbol: "RETH",
    name: "Rocket Pool RETH",
    verified: true,
    chain: "Ethereum",
    category: "liquid-staking",
    sources: [
      {
        scheme: "defillama",
        ref: "d4b3c522-6127-4b89-bedf-83641cdcd2eb",
        kind: "reportedApy",
        legName: "defillama-reth",
      },
    ],
    independenceLabel:
      "Rocket Pool RETH (liquid staking). DefiLlama reported APY. Single source; an on-chain rate cross-check is pending.",
  },
  {
    symbol: "CBETH",
    name: "Coinbase CBETH",
    verified: true,
    chain: "Ethereum",
    category: "liquid-staking",
    sources: [
      {
        scheme: "defillama",
        ref: "0f45d730-b279-4629-8e11-ccb5cc3038b4",
        kind: "reportedApy",
        legName: "defillama-cbeth",
      },
    ],
    independenceLabel:
      "Coinbase CBETH (liquid staking). DefiLlama reported APY. Single source; an on-chain rate cross-check is pending.",
  },
  {
    symbol: "ETHX",
    name: "Stader ETHX",
    verified: true,
    chain: "Ethereum",
    category: "liquid-staking",
    sources: [
      {
        scheme: "defillama",
        ref: "90bfb3c2-5d35-4959-a275-ba5085b08aa3",
        kind: "reportedApy",
        legName: "defillama-ethx",
      },
    ],
    independenceLabel:
      "Stader ETHX (liquid staking). DefiLlama reported APY. Single source; an on-chain rate cross-check is pending.",
  },
  {
    symbol: "SFRXETH",
    name: "Frax SFRXETH",
    verified: true,
    chain: "Ethereum",
    category: "liquid-staking",
    sources: [
      {
        scheme: "defillama",
        ref: "5b3aebb3-891d-47fc-92e2-927ada3d5b82",
        kind: "reportedApy",
        legName: "defillama-sfrxeth",
      },
    ],
    independenceLabel:
      "Frax SFRXETH (liquid staking). DefiLlama reported APY. Single source; an on-chain rate cross-check is pending.",
  },
  {
    symbol: "MATICX",
    name: "Stader MATICX",
    verified: true,
    chain: "Polygon",
    category: "liquid-staking",
    sources: [
      {
        scheme: "defillama",
        ref: "5b1fe146-7cbd-448d-bf53-8df9c3501016",
        kind: "reportedApy",
        legName: "defillama-maticx",
      },
    ],
    independenceLabel:
      "Stader MATICX (liquid staking). DefiLlama reported APY. Single source; an on-chain rate cross-check is pending.",
  },
  {
    symbol: "mplUSDC",
    name: "Maple USDC",
    verified: true,
    chain: "Ethereum",
    category: "private-credit",
    sources: [
      {
        scheme: "defillama",
        ref: "43641cf5-a92e-416b-bce9-27113d3c0db6",
        kind: "reportedApy",
        legName: "defillama-mplusdc",
      },
    ],
    independenceLabel:
      "Maple USDC (private credit / institutional lending). DefiLlama reported APY. Single source; does not catch borrower default risk.",
  },
  {
    symbol: "mplUSDT",
    name: "Maple USDT",
    verified: true,
    chain: "Ethereum",
    category: "private-credit",
    sources: [
      {
        scheme: "defillama",
        ref: "8edfdf02-cdbb-43f7-bca6-954e5fe56813",
        kind: "reportedApy",
        legName: "defillama-mplusdt",
      },
    ],
    independenceLabel:
      "Maple USDT (private credit / institutional lending). DefiLlama reported APY. Single source; does not catch borrower default risk.",
  },
  {
    symbol: "USDX",
    name: "Clearpool USDX",
    verified: true,
    chain: "Flare",
    category: "private-credit",
    sources: [
      {
        scheme: "defillama",
        ref: "be50b874-8147-440d-b8ca-f2c202e9ed64",
        kind: "reportedApy",
        legName: "defillama-usdx",
      },
    ],
    independenceLabel:
      "Clearpool USDX (private credit / institutional lending). DefiLlama reported APY. Single source; does not catch borrower default risk.",
  },
  {
    symbol: "SUSDE",
    name: "Ethena SUSDE",
    verified: true,
    chain: "Ethereum",
    category: "synthetic-dollar",
    sources: [
      {
        scheme: "defillama",
        ref: "66985a81-9c51-46ca-9977-42b4fe7bc6df",
        kind: "reportedApy",
        legName: "defillama-susde",
      },
    ],
    independenceLabel:
      "Ethena SUSDE (synthetic-dollar yield). DefiLlama reported APY, issuer-derived. Single source, full transparency; does not catch issuer fraud.",
  },
  {
    symbol: "USYC",
    name: "Circle USYC USYC",
    verified: true,
    chain: "BSC",
    category: "tokenized-treasury",
    sources: [
      {
        scheme: "defillama",
        ref: "7c0a89c7-70cf-460c-b62e-cb278bf97e8f",
        kind: "reportedApy",
        legName: "defillama-usyc",
      },
    ],
    independenceLabel:
      "Circle USYC USYC (tokenized US Treasuries / money-market). DefiLlama reported APY, issuer-derived. Single source, full transparency; does not catch issuer fraud.",
  },
  {
    symbol: "BUIDL",
    name: "BlackRock BUIDL BUIDL",
    verified: true,
    chain: "Ethereum",
    category: "tokenized-treasury",
    sources: [
      {
        scheme: "defillama",
        ref: "b663ca59-c7e6-4435-ae4a-28d339ce6a15",
        kind: "reportedApy",
        legName: "defillama-buidl",
      },
    ],
    independenceLabel:
      "BlackRock BUIDL BUIDL (tokenized US Treasuries / money-market). DefiLlama reported APY, issuer-derived. Single source, full transparency; does not catch issuer fraud.",
  },
  {
    symbol: "OUSG",
    name: "Ondo OUSG",
    verified: true,
    chain: "XRPL",
    category: "tokenized-treasury",
    sources: [
      {
        scheme: "defillama",
        ref: "36e8a552-9e64-42da-b8f8-1a20866510d8",
        kind: "reportedApy",
        legName: "defillama-ousg",
      },
    ],
    independenceLabel:
      "Ondo OUSG (tokenized US Treasuries / money-market). DefiLlama reported APY, issuer-derived. Single source, full transparency; does not catch issuer fraud.",
  },
  {
    symbol: "SDAI",
    name: "Maker sDAI SDAI",
    verified: true,
    chain: "Gnosis",
    category: "tokenized-treasury",
    sources: [
      {
        scheme: "defillama",
        ref: "13392973-be6e-4b2f-bce9-4f7dd53d1c3a",
        kind: "reportedApy",
        legName: "defillama-sdai",
      },
    ],
    independenceLabel:
      "Maker sDAI SDAI (tokenized US Treasuries / money-market). DefiLlama reported APY, issuer-derived. Single source, full transparency; does not catch issuer fraud.",
  },
  {
    symbol: "TBL",
    name: "openeden-tbill TBL",
    verified: true,
    chain: "XRPL",
    category: "tokenized-treasury",
    sources: [
      {
        scheme: "defillama",
        ref: "8032e541-5c60-4c68-9202-2812e75dab57",
        kind: "reportedApy",
        legName: "defillama-tbl",
      },
    ],
    independenceLabel:
      "openeden-tbill TBL (tokenized US Treasuries / money-market). DefiLlama reported APY, issuer-derived. Single source, full transparency; does not catch issuer fraud.",
  },
  {
    symbol: "USDO",
    name: "openeden-usdo USDO",
    verified: true,
    chain: "Ethereum",
    category: "tokenized-treasury",
    sources: [
      {
        scheme: "defillama",
        ref: "f083596e-032d-4d6b-a7a8-1836d3f99bcd",
        kind: "reportedApy",
        legName: "defillama-usdo",
      },
    ],
    independenceLabel:
      "openeden-usdo USDO (tokenized US Treasuries / money-market). DefiLlama reported APY, issuer-derived. Single source, full transparency; does not catch issuer fraud.",
  },
  {
    symbol: "TBILL",
    name: "openeden-tbill TBILL",
    verified: true,
    chain: "Ethereum",
    category: "tokenized-treasury",
    sources: [
      {
        scheme: "defillama",
        ref: "e140f3b2-0327-46ea-93f5-88b17b0a0a16",
        kind: "reportedApy",
        legName: "defillama-tbill",
      },
    ],
    independenceLabel:
      "openeden-tbill TBILL (tokenized US Treasuries / money-market). DefiLlama reported APY, issuer-derived. Single source, full transparency; does not catch issuer fraud.",
  },
  {
    symbol: "STBT",
    name: "matrixdock-stbt STBT",
    verified: true,
    chain: "Ethereum",
    category: "tokenized-treasury",
    sources: [
      {
        scheme: "defillama",
        ref: "723797ce-f2ec-49a9-8463-7e57e02b6ea5",
        kind: "reportedApy",
        legName: "defillama-stbt",
      },
    ],
    independenceLabel:
      "matrixdock-stbt STBT (tokenized US Treasuries / money-market). DefiLlama reported APY, issuer-derived. Single source, full transparency; does not catch issuer fraud.",
  },
  {
    symbol: "CUSDO",
    name: "openeden-usdo CUSDO",
    verified: true,
    chain: "Solana",
    category: "tokenized-treasury",
    sources: [
      {
        scheme: "defillama",
        ref: "12169161-7815-4160-bd77-a4202cf7c2c1",
        kind: "reportedApy",
        legName: "defillama-cusdo",
      },
    ],
    independenceLabel:
      "openeden-usdo CUSDO (tokenized US Treasuries / money-market). DefiLlama reported APY, issuer-derived. Single source, full transparency; does not catch issuer fraud.",
  },
];
