import Wallet from "../wallet.js";

import DashPhrase from "dashphrase";
import DashHd from "dashhd";

// casino reveal crop open ordinary garment spy pizza clown exercise poem enjoy
let phrase =
	"own found reform rapid phrase change oxygen spend amazing hungry tenant claw";
let salt = "";

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
		// coinType, // TODO fix and then unbreak tests
		versions,
	});
	let accountIndex = 0;
	let accountInfo = await Wallet.rawGetAccountKey(
		network,
		walletKey,
		accountIndex,
	);

	let xkeyInfo = await Wallet.rawGetUsageKey(
		network,
		walletKey,
		accountIndex,
		DashHd.RECEIVE,
	);
	let keyStates = await Wallet.getUnusedKeys(xkeyInfo.accountId, xkeyInfo, 3);

	{
		let firstAddress = keyStates[0].address;

		let cjInfo0 = await Wallet.getCoinJoinAddressFor(accountInfo, firstAddress);
		let round0 = cjInfo0.address; // for denomination
		if (
			round0 !== "yZMv92ph3iEdghotEHAcfeygrAdnFH85Jv" ||
			cjInfo0.usage !== 2
		) {
			throw new Error(`cj round 0 broke`);
		}

		let cjInfo1 = await Wallet.getCoinJoinAddressFor(accountInfo, round0);
		let round1 = cjInfo1.address;
		if (
			round1 !== "yWyVWPioYWWVYzw9EHseW1R4bbMUWQ7a84" ||
			cjInfo1.usage !== 3
		) {
			throw new Error(`cj round 1 broke`);
		}

		let cjInfo2 = await Wallet.getCoinJoinAddressFor(accountInfo, round1);
		let round2 = cjInfo2.address;
		if (
			round2 !== "yLzz6mDbcu9pNC8Kn1rRopSbJpRHqMv5c3" ||
			cjInfo2.usage !== 4
		) {
			throw new Error(`cj round 2 broke`);
		}
	}

	{
		// mark this address as used and update related state
		let keyState =
			Wallet.Addresses._cache["yZMv92ph3iEdghotEHAcfeygrAdnFH85Jv"];
		keyState.hasBeenUsed = true;

		let cjUsageInfo = await Wallet.rawGetUsageKey(
			network,
			walletKey,
			accountIndex,
			Wallet.USAGE_COINJOIN,
		);
		let usageState = Wallet._getState(
			cjUsageInfo.accountId,
			Wallet.USAGE_COINJOIN,
		);
		Wallet.updateKeyState(usageState, keyState);
		// console.log(Wallet.Addresses._cache);
		//
		//

		let address2 = keyStates[1].address;

		let cjInfo0 = await Wallet.getCoinJoinAddressFor(accountInfo, address2);
		let round0 = cjInfo0.address; // for denomination

		let cjInfo1 = await Wallet.getCoinJoinAddressFor(accountInfo, round0);
		let round1 = cjInfo1.address;

		let cjInfo2 = await Wallet.getCoinJoinAddressFor(accountInfo, round1);
		let round2 = cjInfo2.address;
		if (
			round2 !== "yWVADA7QxPXA5XrGj5mqHxRY8eckiAumYZ" ||
			cjInfo2.usage !== 4
		) {
			throw new Error(`cj round 2.2 broke`);
		}

		let maxRounds = 1;
		let msg = "should not have exceeded max rounds";
		try {
			void (await Wallet.getCoinJoinAddressFor(accountInfo, round1, maxRounds));
			throw new Error(msg);
		} catch (e) {
			if (e.code !== "E_COINJOIN_MAX_ROUNDS") {
				throw e;
			}
		}
	}
	console.info(`PASS`);
}

test().catch(function (err) {
	console.error(err.stack);
});
