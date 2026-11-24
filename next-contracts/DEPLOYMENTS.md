# Deployments

## Mainnet (2026-11-24)

Deployer `SP2BM4WCNQM286PFHPGA1BG2YXER0PCG1PKQ5MF1X`, published from Leather through `leather-deploy/` (no powers over the contracts). Clarity 6, epoch 4.0. Verified with `node scripts/verify-deploy.mjs mainnet SP2BM4WCNQM286PFHPGA1BG2YXER0PCG1PKQ5MF1X`: on-chain source equals `build/mainnet`, roles equal the build. The sources equal the tested testnet sources except the network constants.

- Treasury: `SMFE58EKCK5ZPD7YCYM1CQY7K3H8SEXQH7C3YT8S` (Leather multisig vault "Nayori Treasury", 2 of 2)
- Appeal authority: `SM3950RVR364J25ZRFFNHB5TCNJ7VKPKKGD4N2RP9` (Leather multisig vault "Nayori Appeal Authority", 2 of 2)
- sBTC: `SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token`

| Contract | Deploy tx | Block |
|---|---|---|
| `SP2BM4WCNQM286PFHPGA1BG2YXER0PCG1PKQ5MF1X.nayori-permissions` | `0x4fe03ef0885bfcb8c7a4552b34ee39ebbf094d640ce9724558d2cb0d4050d730` | 9566496 |
| `SP2BM4WCNQM286PFHPGA1BG2YXER0PCG1PKQ5MF1X.nayori-roles` | `0x44038165c2c8b413b0c717bf84a82cd3085ee522faabcd6a52decd9d68661f67` | 9566505 |
| `SP2BM4WCNQM286PFHPGA1BG2YXER0PCG1PKQ5MF1X.nayori-reputation` | `0x6b37073aacb035fcaedff762f960bbe38d198ce8930c524a16efc144d77fee74` | 9566520 |
| `SP2BM4WCNQM286PFHPGA1BG2YXER0PCG1PKQ5MF1X.nayori-escrow-sbtc` | `0x9ed1c15dcc831ede9beb4d4224e449b8d5f29f07cca6364644501e91a2a77bd3` | 9566526 |
| `SP2BM4WCNQM286PFHPGA1BG2YXER0PCG1PKQ5MF1X.nayori-escrow-stx` | `0xa496776172d4792c076b37db12132958bee97937e68c4c24c24455684505c292` | 9566531 |
| `SP2BM4WCNQM286PFHPGA1BG2YXER0PCG1PKQ5MF1X.nayori-agents` | `0x2d8f488242e68c2527de8e0991c536528085030dd9acf57f1eadbf5e0d69460e` | 9566581 |
| `SP2BM4WCNQM286PFHPGA1BG2YXER0PCG1PKQ5MF1X.nayori-applications` | `0x50954be06031a56f877b599916aff82d29fa1706000417bea2269e4b811e67d2` | 9566584 |

## Testnet rehearsal from Leather (2026-11-24)

Same Leather account on testnet, same `build/testnet` sources; all 7 Clarity 6 and identical to the build.

| Contract | Deploy tx |
|---|---|
| `ST2BM4WCNQM286PFHPGA1BG2YXER0PCG1PKVF4MZ5.nayori-permissions` | `0x26976a333496f559b9e34707ac35510154cb26fc6bc51fd23428b31d62b31aad` |
| `ST2BM4WCNQM286PFHPGA1BG2YXER0PCG1PKVF4MZ5.nayori-roles` | `0xf3594d33cd0d9a8955c7c43111cbc5db755f6061350a19d81d070c86a0511848` |
| `ST2BM4WCNQM286PFHPGA1BG2YXER0PCG1PKVF4MZ5.nayori-reputation` | `0x06d9d503af6a99fa84a3a35978e31e1a61899cb92313d52378dd4176753154d4` |
| `ST2BM4WCNQM286PFHPGA1BG2YXER0PCG1PKVF4MZ5.nayori-escrow-sbtc` | `0x082362bf67bf5799722ecf27f21396ad21ada5a70c73feaa14d8d49185c5b357` |
| `ST2BM4WCNQM286PFHPGA1BG2YXER0PCG1PKVF4MZ5.nayori-escrow-stx` | `0x0f061d92fa4a86387f06b3ad770d77a596b0831189775a725de2fd5edc00cc58` |
| `ST2BM4WCNQM286PFHPGA1BG2YXER0PCG1PKVF4MZ5.nayori-agents` | `0xf9194a21c76fbc65bd394222f127a411354599d229c694d1e46590059d48bede` |
| `ST2BM4WCNQM286PFHPGA1BG2YXER0PCG1PKVF4MZ5.nayori-applications` | `0x306f8a6557aae298f0dc2bb1dc0face64be25fb8a3389aaa0f4da18f1d560420` |

## Testnet (2026-11-24)

Deployer `ST3MRPNX0VNWYRSJ07PNTASE5BZ9K5XE57ARZ39DY` (testnet-only wallet, no powers over the contracts). Clarity 6, epoch 4.0. Verified with `node scripts/verify-deploy.mjs testnet ST3MRPNX0VNWYRSJ07PNTASE5BZ9K5XE57ARZ39DY`: on-chain source equals `build/testnet`, roles equal the build.

- Treasury (test wallet): `STHV38DZX23VB42EX9PE44S3WCC20DNC3V62T4N3`
- Appeal authority (test wallet): `ST12SP3EXFGP6GNK0WJ9GKJ2NSHE9243MHG4JBHPS`

| Contract | Deploy tx |
|---|---|
| `ST3MRPNX0VNWYRSJ07PNTASE5BZ9K5XE57ARZ39DY.nayori-permissions` | `fdb6f831c06bc5c84eb3e7353ee52cbd1e570fb3e3d7a83de16217b05064fde3` |
| `ST3MRPNX0VNWYRSJ07PNTASE5BZ9K5XE57ARZ39DY.nayori-roles` | `c10fdef9013e132423a816e259927e657225922eb598529a43e8e9f0a8143a0f` |
| `ST3MRPNX0VNWYRSJ07PNTASE5BZ9K5XE57ARZ39DY.nayori-reputation` | `24d098f175d3ca5580955ae2b081a79ad73975c9e550b2092b6f77f00e95fa2c` |
| `ST3MRPNX0VNWYRSJ07PNTASE5BZ9K5XE57ARZ39DY.nayori-escrow-sbtc` | `344a4a2012d18b4e1ba669ae6b128d72a655f0fef024a68f8561afa5f414be6d` |
| `ST3MRPNX0VNWYRSJ07PNTASE5BZ9K5XE57ARZ39DY.nayori-escrow-stx` | `6874927fc489ee3e14dc5a1309723e71ea9dc78a99fc156b687b9430915e4ebd` |
| `ST3MRPNX0VNWYRSJ07PNTASE5BZ9K5XE57ARZ39DY.nayori-agents` | `f5256ff15f6775a20b3114de6038b583007324b668bd4ca6d7c30f0f2504ae70` |
| `ST3MRPNX0VNWYRSJ07PNTASE5BZ9K5XE57ARZ39DY.nayori-applications` | `ef2bb9999c954ca53b81c2b168ce02a7de13cb8c3cb13bd0b214cfbfc5f42384` |

End-to-end run on testnet: 36/36 checks passed. Appeal resolved for the provider (provider +4.9 STX, treasury +0.1 STX), the treasury cannot resolve an appeal, appeal resolved for the client, rating, raw reputation, treasury handover proposed, refused before the delay and cancelled. Job #3 (STX) is left decided for the keeper after the appeal window.
