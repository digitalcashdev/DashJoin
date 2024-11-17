import Wallet from "../wallet.js";

import DashPhrase from "dashphrase";
import DashHd from "dashhd";

// empower illness dry increase season blind girl acid sustain ankle result smile
// casino reveal crop open ordinary garment spy pizza clown exercise poem enjoy
let phrase =
	"own found reform rapid phrase change oxygen spend amazing hungry tenant claw";
let salt = "";

let nonRandomPoolSize = 1;
let maxRounds = 3;

async function test() {
	let network = "testnet";
	let versions = DashHd.MAINNET;
	let coinType = Wallet.COINTYPE_DASH;
	if (network !== "mainnet") {
		versions = DashHd.TESTNET;
		coinType = Wallet.COINTYPE_TESTNET;
	}

	let seedBytes = await DashPhrase.toSeed(phrase, salt);
	let walletKey = await DashHd.fromSeed(seedBytes, {
		purpose: 44, // BIP-44 (default)
		coinType,
		versions,
	});
	let accountIndex = 0;
	let accountInfo = await Wallet.rawGetAccountKey(
		network,
		walletKey,
		accountIndex,
	);
	let cjAccountInfo = accountInfo; // same for now

	let xkeyInfo = await Wallet.rawGetUsageKey(
		network,
		walletKey,
		accountIndex,
		DashHd.RECEIVE,
	);
	let keyStates = await Wallet.peekUnusedKeys(xkeyInfo, 3);

	{
		let firstAddress = keyStates[0].address;

		let cjLockedState0 = await Wallet.CJ.takeRoundKey(
			cjAccountInfo,
			firstAddress,
			maxRounds,
			xkeyInfo,
			nonRandomPoolSize,
		)
			.then(function () {
				throw new Error("expected error");
			})
			.catch(async function (err) {
				if (err.code !== "E_NOT_COINJOIN_LOCKED") {
					throw err;
				}
				let cjLockedState = await Wallet.CJ.takeDenominationKey(
					cjAccountInfo,
					firstAddress,
					nonRandomPoolSize,
				);
				return cjLockedState;
			});
		let round0 = cjLockedState0.address; // for denomination
		if (
			round0 !== "yZ43umwfNDVCeBw8hh84hxdqxCpMosPsMk" ||
			cjLockedState0.usage !== 2
		) {
			throw new Error(`cj round 0 broke`);
		}

		let cjLockedState1 = await Wallet.CJ.takeRoundKey(
			cjAccountInfo,
			round0,
			maxRounds,
			xkeyInfo,
		);
		let round1 = cjLockedState1.address;
		if (
			round1 !== "yP8oJJcq2TfDC5G2RsyQV3SpJhE123vxkQ" ||
			cjLockedState1.usage !== 3
		) {
			throw new Error(`cj round 1 broke`);
		}

		let cjLockedState2 = await Wallet.CJ.takeRoundKey(
			cjAccountInfo,
			round1,
			maxRounds,
			xkeyInfo,
		);
		let round2 = cjLockedState2.address;
		if (
			round2 !== "yRKcWaWSzkUFHytQbLYsarmFUQCe4NPva1" ||
			cjLockedState2.usage !== 4
		) {
			throw new Error(`cj round 2 broke`);
		}
	}

	{
		let address2 = keyStates[1].address;

		let cjLockedState0 = await Wallet.CJ.takeDenominationKey(
			accountInfo,
			address2,
			nonRandomPoolSize,
		);
		let round0 = cjLockedState0.address; // for denomination

		let cjLockedState1 = await Wallet.CJ.takeRoundKey(
			cjAccountInfo,
			round0,
			maxRounds,
			xkeyInfo,
		);
		let round1 = cjLockedState1.address;

		let cjLockedState2 = await Wallet.CJ.takeRoundKey(
			cjAccountInfo,
			round1,
			maxRounds,
			xkeyInfo,
		);
		let round2 = cjLockedState2.address;
		if (
			round2 !== "yeUXmMCBmGbt7oBdV7fKzUivRBngRApaW7" ||
			cjLockedState2.usage !== 4
		) {
			console.log(round2);
			throw new Error(`cj round 2.2 broke`);
		}

		let lowerRoundsToUnlock = 0;
		let unlockedState = await Wallet.CJ.takeRoundKey(
			cjAccountInfo,
			round1,
			lowerRoundsToUnlock,
			xkeyInfo,
		);

		try {
			void (await Wallet.CJ.takeRoundKey(
				cjAccountInfo,
				unlockedState.address,
				maxRounds,
				xkeyInfo,
			));
			let msg = "should have failed to advance non-coinjoin-locked address";
			throw new Error(msg);
		} catch (e) {
			/** @type {Error & { code: String }} */ //@ts-expect-error
			let err = e;
			if (err.code !== "E_NOT_COINJOIN_LOCKED") {
				throw e;
			}
		}

		try {
			void (await Wallet.CJ.takeDenominationKey(
				cjAccountInfo,
				round2,
				nonRandomPoolSize,
			));
			let msg = "should have failed to denominate coinjoin-locked address";
			throw new Error(msg);
		} catch (e) {
			/** @type {Error & { code: String }} */ //@ts-expect-error
			let err = e;
			if (err.code !== "E_COINJOIN_IN_OTHER_WALLET") {
				throw e;
			}
		}
	}
	console.info(`PASS`);
}

test().catch(function (err) {
	console.error(err.stack);
});
