/**
 * data/featured-assets.ts — Generated curated RWA asset specs. (D23/D24)
 *
 * Each entry is a REAL DefiLlama pool, vetted for clean current data within its
 * category's plausible band (the pipeline bounds gate). `grade` is a maturity/liquidity
 * signal by TVL (blue-chip/established/emerging/long-tail), not a quality endorsement;
 * lower grades abstain more often via the gates. Generated; mETH (two computation paths)
 * is defined separately in source-registry.ts. Labels never use the word "independent".
 */

import type { AssetSpec } from "./types.js";

export const GENERATED_FEATURED: AssetSpec[] = [
  {
    symbol: "USDT0",
    name: "Aave USDT0",
    verified: true,
    chain: "Mantle",
    category: "lending",
    grade: "emerging",
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
    grade: "long-tail",
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
    grade: "emerging",
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
    name: "Lombard LBTC",
    verified: true,
    chain: "Ethereum",
    category: "btc-yield",
    grade: "established",
    sources: [
      {
        scheme: "defillama",
        ref: "c9762afb-7746-4b5a-a484-a8881a348999",
        kind: "reportedApy",
        legName: "defillama-lbtc",
      },
    ],
    independenceLabel: "Lombard LBTC (BTC yield). DefiLlama reported APY. Single source.",
  },
  {
    symbol: "WEETH",
    name: "ether.fi WEETH",
    verified: true,
    chain: "Ethereum",
    category: "liquid-restaking",
    grade: "blue-chip",
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
    grade: "blue-chip",
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
    grade: "established",
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
    grade: "emerging",
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
    grade: "blue-chip",
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
    grade: "blue-chip",
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
    grade: "blue-chip",
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
    grade: "established",
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
    grade: "established",
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
    grade: "emerging",
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
    grade: "long-tail",
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
    grade: "blue-chip",
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
    grade: "established",
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
    grade: "emerging",
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
    grade: "blue-chip",
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
    grade: "blue-chip",
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
    grade: "established",
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
    grade: "established",
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
    symbol: "TBL",
    name: "OpenEden TBL",
    verified: true,
    chain: "XRPL",
    category: "tokenized-treasury",
    grade: "emerging",
    sources: [
      {
        scheme: "defillama",
        ref: "8032e541-5c60-4c68-9202-2812e75dab57",
        kind: "reportedApy",
        legName: "defillama-tbl",
      },
    ],
    independenceLabel:
      "OpenEden TBL (tokenized US Treasuries / money-market). DefiLlama reported APY, issuer-derived. Single source, full transparency; does not catch issuer fraud.",
  },
  {
    symbol: "USDO",
    name: "OpenEden USDO",
    verified: true,
    chain: "Ethereum",
    category: "tokenized-treasury",
    grade: "emerging",
    sources: [
      {
        scheme: "defillama",
        ref: "f083596e-032d-4d6b-a7a8-1836d3f99bcd",
        kind: "reportedApy",
        legName: "defillama-usdo",
      },
    ],
    independenceLabel:
      "OpenEden USDO (tokenized US Treasuries / money-market). DefiLlama reported APY, issuer-derived. Single source, full transparency; does not catch issuer fraud.",
  },
  {
    symbol: "TBILL",
    name: "OpenEden TBILL",
    verified: true,
    chain: "Ethereum",
    category: "tokenized-treasury",
    grade: "emerging",
    sources: [
      {
        scheme: "defillama",
        ref: "e140f3b2-0327-46ea-93f5-88b17b0a0a16",
        kind: "reportedApy",
        legName: "defillama-tbill",
      },
    ],
    independenceLabel:
      "OpenEden TBILL (tokenized US Treasuries / money-market). DefiLlama reported APY, issuer-derived. Single source, full transparency; does not catch issuer fraud.",
  },
  {
    symbol: "STBT",
    name: "Matrixdock STBT",
    verified: true,
    chain: "Ethereum",
    category: "tokenized-treasury",
    grade: "long-tail",
    sources: [
      {
        scheme: "defillama",
        ref: "723797ce-f2ec-49a9-8463-7e57e02b6ea5",
        kind: "reportedApy",
        legName: "defillama-stbt",
      },
    ],
    independenceLabel:
      "Matrixdock STBT (tokenized US Treasuries / money-market). DefiLlama reported APY, issuer-derived. Single source, full transparency; does not catch issuer fraud.",
  },
  {
    symbol: "CUSDO",
    name: "OpenEden CUSDO",
    verified: true,
    chain: "Solana",
    category: "tokenized-treasury",
    grade: "long-tail",
    sources: [
      {
        scheme: "defillama",
        ref: "12169161-7815-4160-bd77-a4202cf7c2c1",
        kind: "reportedApy",
        legName: "defillama-cusdo",
      },
    ],
    independenceLabel:
      "OpenEden CUSDO (tokenized US Treasuries / money-market). DefiLlama reported APY, issuer-derived. Single source, full transparency; does not catch issuer fraud.",
  },
  {
    symbol: "SUSDS",
    name: "Sky SUSDS",
    verified: true,
    chain: "Ethereum",
    category: "vault",
    grade: "blue-chip",
    sources: [
      {
        scheme: "defillama",
        ref: "d8c4eff5-c8a9-46fc-a888-057c4c668e72",
        kind: "reportedApy",
        legName: "defillama-susds",
      },
    ],
    independenceLabel:
      "Sky SUSDS (yield vault / active strategy). DefiLlama reported vault APY. Single source; reflects the vault's reported share yield, not a strategy-quality judgment.",
  },
  {
    symbol: "GTUSDCP",
    name: "Morpho GTUSDCP",
    verified: true,
    chain: "Base",
    category: "vault",
    grade: "established",
    sources: [
      {
        scheme: "defillama",
        ref: "e0672197-9f3e-4414-bca5-e6b4c90aa469",
        kind: "reportedApy",
        legName: "defillama-gtusdcp",
      },
    ],
    independenceLabel:
      "Morpho GTUSDCP (yield vault / active strategy). DefiLlama reported vault APY. Single source; reflects the vault's reported share yield, not a strategy-quality judgment.",
  },
  {
    symbol: "STEAKUSDC",
    name: "Morpho STEAKUSDC",
    verified: true,
    chain: "Base",
    category: "vault",
    grade: "established",
    sources: [
      {
        scheme: "defillama",
        ref: "7820bd3c-461a-4811-9f0b-1d39c1503c3f",
        kind: "reportedApy",
        legName: "defillama-steakusdc",
      },
    ],
    independenceLabel:
      "Morpho STEAKUSDC (yield vault / active strategy). DefiLlama reported vault APY. Single source; reflects the vault's reported share yield, not a strategy-quality judgment.",
  },
  {
    symbol: "SENPYUSD",
    name: "Morpho SENPYUSD",
    verified: true,
    chain: "Ethereum",
    category: "vault",
    grade: "established",
    sources: [
      {
        scheme: "defillama",
        ref: "c032b20d-49bb-4f95-8c8c-ae6333728a6e",
        kind: "reportedApy",
        legName: "defillama-senpyusd",
      },
    ],
    independenceLabel:
      "Morpho SENPYUSD (yield vault / active strategy). DefiLlama reported vault APY. Single source; reflects the vault's reported share yield, not a strategy-quality judgment.",
  },
  {
    symbol: "SENPYUSDMAIN",
    name: "Morpho SENPYUSDMAIN",
    verified: true,
    chain: "Ethereum",
    category: "vault",
    grade: "established",
    sources: [
      {
        scheme: "defillama",
        ref: "699f25fe-09f4-4f82-8f58-baa5b0af8fa4",
        kind: "reportedApy",
        legName: "defillama-senpyusdmain",
      },
    ],
    independenceLabel:
      "Morpho SENPYUSDMAIN (yield vault / active strategy). DefiLlama reported vault APY. Single source; reflects the vault's reported share yield, not a strategy-quality judgment.",
  },
  {
    symbol: "SDAI",
    name: "Sky SDAI",
    verified: true,
    chain: "Ethereum",
    category: "vault",
    grade: "established",
    sources: [
      {
        scheme: "defillama",
        ref: "c8a24fee-ec00-4f38-86c0-9f6daebc4225",
        kind: "reportedApy",
        legName: "defillama-sdai",
      },
    ],
    independenceLabel:
      "Sky SDAI (yield vault / active strategy). DefiLlama reported vault APY. Single source; reflects the vault's reported share yield, not a strategy-quality judgment.",
  },
  {
    symbol: "SENRLUSDV2",
    name: "Morpho SENRLUSDV2",
    verified: true,
    chain: "Ethereum",
    category: "vault",
    grade: "established",
    sources: [
      {
        scheme: "defillama",
        ref: "2e53bb82-f13f-4157-a3bf-b1a91b94b6a4",
        kind: "reportedApy",
        legName: "defillama-senrlusdv2",
      },
    ],
    independenceLabel:
      "Morpho SENRLUSDV2 (yield vault / active strategy). DefiLlama reported vault APY. Single source; reflects the vault's reported share yield, not a strategy-quality judgment.",
  },
  {
    symbol: "SENRLUSD",
    name: "Morpho SENRLUSD",
    verified: true,
    chain: "Ethereum",
    category: "vault",
    grade: "established",
    sources: [
      {
        scheme: "defillama",
        ref: "b9e65633-654a-4e6b-9271-970a7246cb61",
        kind: "reportedApy",
        legName: "defillama-senrlusd",
      },
    ],
    independenceLabel:
      "Morpho SENRLUSD (yield vault / active strategy). DefiLlama reported vault APY. Single source; reflects the vault's reported share yield, not a strategy-quality judgment.",
  },
];
