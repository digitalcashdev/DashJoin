//
// USAGE
//
// <header><nav>
//     <a data-href="#dashboard" class="active">Home</a>
//     <a data-href="#settings">Settings</a>
// </nav></header>
// <main>
//     <section data-semtab="dashboard">...</section>
//     <section data-semtab="settings">...</section>
// </main>
// <script>
//     import $SemTabs from './semantic-tabs.js'
//     $SemTabs.init();
// </script>
//
// How it works:
//   - add 'data-href' to links
//   - add 'data-semtab' to tab elements
//   - 'location.hash' changes will trigger SemTabs
//   - SemTabs will toggle 'href', 'hidden', and the '.active' class for known hashes
//   - SemTabs.init() reads or sets the initial 'location.hash' state
//
// That's it.

/** @typedef {HTMLAnchorElement & {dataset: {href: string}}} TabAnchor */
/** @typedef {HTMLAnchorElement & {dataset: {semtab: string}}} TabTarget */

let $SemTabs = {};

// let $ = window.$;
/**
 * Select first matching element, just like console $
 * @param {String} cssSelector
 * @param {ParentNode} [$parent=document]
 */
function $(cssSelector, $parent = document) {
	let $child = $parent.querySelector(cssSelector);
	return $child;
}

/**
 * @callback QuerySelectorAll
 * @param {String} cssSelector
 * @param {HTMLElement} [$parentElement=document]
 * @returns {Array<HTMLElement>}
 */
/** @type {QuerySelectorAll} */
//@ts-ignore
function $$(cssSelector, $parent = document) {
	let children = $parent.querySelectorAll(cssSelector);
	let $children = Array.from(children);
	//@ts-ignore - trust me bro, it's an HTMLElement
	return $children;
}

// let $$ = window.$$;

$SemTabs.init = function () {
	window.removeEventListener('hashchange', $SemTabs._hashChange, false);
	window.addEventListener('hashchange', $SemTabs._hashChange, false);

	if ('' !== location.hash.slice(1)) {
		$SemTabs._hashChange();
		return;
	}
	$SemTabs._setToFirst();
};

$SemTabs._setToFirst = function () {
	/** @type {TabTarget} */ // @ts-ignore
	let $firstTab = $('[data-semtab]');
	let tabName = $firstTab.dataset.semtab;
	location.hash = `#${tabName}`;
};

$SemTabs._hashChange = function () {
	if ('#' === location.hash) {
		$SemTabs._setToFirst();
		return;
	}

	requestAnimationFrame($SemTabs._batchStateChanges);
};

$SemTabs._batchStateChanges = function () {
	let tabName = location.hash.slice(1);

	for (let _$tabLink of $$('a[data-href]')) {
		/** @type {TabAnchor} */ // @ts-ignore
		let $tabLink = _$tabLink;

		let hash = $tabLink.dataset.href;
		if (location.hash === hash) {
			$tabLink.classList.add('active');
			$tabLink.removeAttribute('href');
			continue;
		}

		$tabLink.classList.remove('active');
		$tabLink.href = $tabLink.dataset.href;
	}

	let $activeTab = $(`[data-semtab="${tabName}"]`);
	if (!$activeTab) {
		console.warn(
			`[SemTabs] cowardly refusing to set 'hidden' on existing semtabs for unknown link '${location.hash}'`,
		);
		return;
	}
	for (let $tabBody of $$(`[data-semtab]`)) {
		let name = $tabBody.dataset.semtab;

		if (name !== tabName) {
			$tabBody.hidden = true;
			$tabBody.classList.remove('active');
			continue;
		}

		$tabBody.classList.add('active');
		$tabBody.hidden = false;
	}
	let $event = new CustomEvent(`semtab:${tabName}`, { bubbles: true });
	$activeTab.dispatchEvent($event);
};

export default $SemTabs;
