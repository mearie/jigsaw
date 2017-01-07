;(function(window) {
	var SCATTER_SIZE_SCALE = 0.8;
	var BOARD_SIZE_SCALE = 1.6; // note that we also round the size up to next grid

	var IMAGES = {
		kinkakuji: {
			imagePath: 'images/kinkakuji.jpg?20170107a',
			imageWidth: 768,
			imageHeight: 1024,
			previewPath: 'images/kinkakuji-thumb.jpg?20170107a',
			rows: 10,
			columns: 8,
			source: '<strong><a href="https://commons.wikimedia.org/wiki/File:Kinkaku-ji_in_November_2016_-02.jpg">Kinkaku-ji</a> in Kyoto, Japan.</strong> Photography by Martin Falbisoner, used under the terms of <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.en">CC-BY-SA 4.0 International</a> license.'
		},
		pteridium: {
			imagePath: 'images/pteridium.jpg?20170107a',
			imageWidth: 1280,
			imageHeight: 853,
			previewPath: 'images/pteridium-thumb.jpg?20170107a',
			rows: 10,
			columns: 15,
			source: '<strong><a href="https://commons.wikimedia.org/wiki/File:%D0%9F%D1%80%D0%BE%D0%B2%D0%BE%D0%B4%D1%8F%D1%89%D0%B8%D0%B9_%D0%BF%D1%83%D1%87%D0%BE%D0%BA_Pteridium_aquilinum.JPG">Amphycribral vascular bundle of bracket (<i>Pteridium aquilinum</i>) rhizome</a>, 250x magnified.</strong> Photography by Anatoly Mikhaltsov, used under the terms of <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.en">CC-BY-SA 4.0 International</a> license.'
		},
		hochiminh: {
			imagePath: 'images/hochiminh.jpg?20170107a',
			imageWidth: 1280,
			imageHeight: 853,
			previewPath: 'images/hochiminh-thumb.jpg?20170107a',
			rows: 12,
			columns: 18,
			source: '<strong><a href="https://commons.wikimedia.org/wiki/File:Vista_de_Ciudad_Ho_Chi_Minh_desde_Bitexco_Financial_Tower,_Vietnam,_2013-08-14,_DD_13.JPG">View of Ho Chi Min City</a>, Vietnam.</strong> Photography by <a href="http://delso.photo/">Diego Delso</a>, used under the terms of <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.en">CC-BY-SA 4.0 International</a> license.'
		},
		tajinepots: {
			imagePath: 'images/tajinepots.jpg?20170107a',
			imageWidth: 2048,
			imageHeight: 1368,
			previewPath: 'images/tajinepots-thumb.jpg?20170107a',
			rows: 16,
			columns: 24,
			source: '<strong><a href="https://commons.wikimedia.org/wiki/File:Tajines_in_a_pottery_shop_in_Morocco.jpg">Moroccan Tajine Pots</a>.</strong> Photography by Jafri Ali, used under the terms of <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.en">CC-BY-SA 4.0 International</a> license.'
		},
		jamehisfahan: {
			imagePath: 'images/jamehisfahan.jpg?20170107a',
			imageWidth: 4000,
			imageHeight: 2500,
			previewPath: 'images/jamehisfahan-thumb.jpg?20170107a',
			rows: 40,
			columns: 60,
			source: '<strong><a href="https://commons.wikimedia.org/wiki/File:Gran_Mezquita_de_Isfah%C3%A1n,_Isfah%C3%A1n,_Ir%C3%A1n,_2016-09-20,_DD_26.jpg">Jāmeh Mosque of Isfahān</a> in Isfahan, Iran.</strong> Partially cropped for the puzzle. Photography by <a href="http://delso.photo/">Diego Delso</a>, used under the terms of <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.en">CC-BY-SA 4.0 International</a> license.'
		}
	};

	var IMAGES_ORDER = Object.keys(IMAGES);
	IMAGES_ORDER.sort(function(a, b) {
		return IMAGES[a].rows * IMAGES[a].columns - IMAGES[b].rows * IMAGES[b].columns;
	});

	var jigsaw;
	var saveDisabled = false;
	var currentImage;
	var accumulatedTime;
	var startTime;
	var completedTime = null;
	var logElement;

	function log(text) {
		logElement.innerText = text;
	}

	function randomSeed() {
		return Math.random() * 4294967296 >>> 0;
	}

	function elapsedSinceStartTime() {
		var now = (completedTime !== null ? completedTime : Jigsaw.prototype.now());

		// while now() will be hopefully monotonic, it might not when a fallback is used
		return Math.max(0, now - startTime);
	}

	function reinitialize(imageId, seed, state, boardPosition) {
		currentImage = imageId;

		jigsaw.finalize();

		var image = IMAGES[imageId];
		jigsaw.seed = seed;
		jigsaw.imagePath = image.imagePath;
		jigsaw.imageWidth = image.imageWidth;
		jigsaw.imageHeight = image.imageHeight;
		jigsaw.rows = image.rows;
		jigsaw.columns = image.columns;
		jigsaw.boardWidth = Math.ceil(image.imageWidth * BOARD_SIZE_SCALE / 100) * 100;
		jigsaw.boardHeight = Math.ceil(image.imageHeight * BOARD_SIZE_SCALE / 100) * 100;

		jigsaw.initialize(state);

		if (boardPosition) {
			jigsaw.boardPosition = boardPosition;
		}
		if (!state) {
			jigsaw.randomizePiecePositions(
				-jigsaw.imageWidth * SCATTER_SIZE_SCALE,
				-jigsaw.imageHeight * SCATTER_SIZE_SCALE,
				jigsaw.imageWidth * SCATTER_SIZE_SCALE,
				jigsaw.imageHeight * SCATTER_SIZE_SCALE);
		}

		// both can be reset by updateCounter
		document.getElementById('jigsaw').classList.remove('completed');
		completedTime = null;
		updateCounter();
	}

	function reset(imageId) {
		if (confirm('Do you want to reset? This cannot be undone!')) {
			saveDisabled = true;
			accumulatedTime = 0;
			reinitialize(currentImage, randomSeed());
			startTime = Jigsaw.prototype.now();
			updateTimer();
			completedTime = null;
			saveDisabled = false;
			save();
			document.getElementById('first').classList.add('shown');
			log('Ready.');

			// tracking events
			if (window._paq) {
				window._paq.push(['trackEvent', 'JigsawPuzzle', 'reset', currentImage]);
			}
		}
	}

	function updateCounter() {
		var remaining = Object.keys(jigsaw.groups).length - 1;
		var total = jigsaw.rows * jigsaw.columns - 1;

		document.getElementById('remaining-counter').innerText = remaining;
		document.getElementById('snap-counter').innerText = total - remaining;
		document.getElementById('counter').style.boxShadow = ((total - remaining) / total * -180) + 'px 0 0 black inset';
		updateProgress(currentImage, remaining, total);

		if (remaining === 0) {
			finale();
		}

		return { remaining: remaining, total: total };
	}

	var lastSess = null, lastTotal = null;
	function updateTimer() {
		var sess = elapsedSinceStartTime();
		var total = accumulatedTime + sess;
		if (lastSess === null || (sess / 1000 | 0) !== (lastSess / 1000 | 0)) {
			document.getElementById('timer-sess').innerText = formatTime(sess);
		}
		if (lastTotal === null || (total / 1000 | 0) !== (lastTotal / 1000 | 0)) {
			document.getElementById('timer-total').innerText = formatTime(total);
		}
		lastSess = sess;
		lastTotal = total;
	}

	function updateProgress(imageId, remaining, total) {
		IMAGES[imageId].progressElements.forEach(function(e) {
			e.style.boxShadow = ((total - remaining) / total * 180) + 'px 0 0 ' + (remaining > 0 ? 'red' : '#cdad00') + ' inset';
		});
	}

	var starFieldGenerated;
	function finale() {
		log('You did it! How about trying other puzzles?');
		document.getElementById('jigsaw').classList.add('completed');

		// automatically open the sidebar, people may not realize there are many puzzles
		document.getElementById('images').classList.add('shown');
		document.body.classList.add('sidebar-open');

		if (completedTime === null) {
			completedTime = Jigsaw.prototype.now();
		}

		// generate star field
		if (!starFieldGenerated) {
			var star = document.createElement('canvas');
			if (!star.toBlob) return;
			star.width = 1000;
			star.height = 1000;
			var c = star.getContext('2d');
			c.clearRect(0, 0, 1000, 1000);
			c.fillStyle = 'white';
			for (var i = 0; i < 2000; ++i) {
				c.beginPath();
				c.arc(Math.random() * 1000, Math.random() * 1000, Math.pow(Math.random(), 3) * 1.5, 0, 2 * Math.PI);
				c.fill();
			}
			star.toBlob(function(blob) {
				document.getElementById('twinkle-star').style.backgroundImage = 'url(' + window.URL.createObjectURL(blob) + ')';
				starFieldGenerated = true;
			});
		}
	}

	function getStorage() {
		try {
			return window.localStorage;
		} catch (e) {
			return null; // can be denied for, e.g. non-http(s) domains in IE/Edge
		}
	}

	function deserializeFromLocalStorage(imageId) {
		var storage = getStorage();
		if (!storage) return null;

		if (!imageId) {
			var globalOptions;
			try {
				globalOptions = JSON.parse(storage.getItem('jigsaw-puzzle'));
			} catch (e) {
			}

			if (!globalOptions) return null;
			imageId = globalOptions.lastImage;
			if (!imageId) return null;
		}

		var puzzle;
		try {
			puzzle = JSON.parse(storage.getItem('jigsaw-puzzle.' + imageId));
		} catch (e) {
		}

		if (!puzzle) return null;

		var image = IMAGES[imageId];
		if (!image) return null;
		if (puzzle.rows !== image.rows || puzzle.columns !== image.columns) return null;
		return {image: imageId, puzzle: puzzle};
	}

	function save() {
		if (saveDisabled) return;

		var storage = getStorage();
		if (!storage) {
			log('Auto-save failed. Local storage is probably not supported or disabled.');
			return;
		}

		storage.setItem('jigsaw-puzzle', JSON.stringify({
			lastImage: currentImage
		}));
		storage.setItem('jigsaw-puzzle.' + currentImage, JSON.stringify({
			rows: jigsaw.rows,
			columns: jigsaw.columns,
			seed: jigsaw.seed,
			state: jigsaw.serializeState(),
			boardPosition: jigsaw.boardPosition,
			lastTime: +new Date(),
			accumulatedTime: accumulatedTime + elapsedSinceStartTime()
		}));
	}

	function reload(stored, defaultImageId) {
		saveDisabled = true;

		var puzzle;
		var imageId;
		if (stored) {
			puzzle = stored.puzzle;
			imageId = stored.image;
			accumulatedTime = puzzle.accumulatedTime;
			log('Recovered from the puzzle saved on ' + new Date(puzzle.lastTime).toLocaleString() + '.');
		} else {
			// fill the default
			puzzle = {seed: randomSeed()};
			imageId = defaultImageId;
			accumulatedTime = 0;
			log('Ready.');
		}

		reinitialize(imageId, puzzle.seed, puzzle.state, puzzle.boardPosition);
		startTime = Jigsaw.prototype.now();
		updateTimer();
		saveDisabled = false;
		save();

		return stored;
	}

	function formatTime(t) {
		t = t / 1000 | 0;

		var s = t % 60;
		var m = (t / 60 | 0) % 60;
		var h = (t / 3600 | 0) % 24;
		var d = t / 86400 | 0;
		return (d > 0 ? d + 'd ' : '') + (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
	}

	function initializeDialog(firstTime) {
		for (var dialogs = document.getElementsByTagName('dialog'), i = 0; dialogs[i]; ++i) {
			dialogs[i].addEventListener('click', function() {
				this.classList.remove('shown');
			}, false);
			for (var inners = dialogs[i].querySelectorAll('div.inner'), j = 0; inners[j]; ++j) {
				inners[j].addEventListener('click', function(e) {
					e.stopPropagation();
				}, false);
				inners[j].addEventListener('selectstart', function(e) {
					e.stopPropagation();
				}, false);
				inners[j].addEventListener('contextmenu', function(e) {
					e.stopPropagation();
				}, false);
			}
		}

		// https://stackoverflow.com/a/14439915/225272
		if (('ontouchstart' in window) || window.documentTouch && document instanceof DocumentTouch) {
			document.getElementById('first').classList.add('touch');
		}

		// touch detection is not as reliable, so we allow to switch instructions
		document.getElementById('first-mouse').addEventListener('click', function() {
			document.getElementById('first').classList.add('touch');
		}, false);
		document.getElementById('first-touch').addEventListener('click', function() {
			document.getElementById('first').classList.remove('touch');
		}, false);

		if (!firstTime) {
			document.getElementById('first').classList.remove('shown');
		}
	}

	function initializeSidebar() {
		document.getElementById('toggle-sidebar').addEventListener('click', function() {
			if (document.body.classList.contains('sidebar-open')) {
				document.body.classList.remove('sidebar-open');
			} else {
				document.body.classList.add('sidebar-open');
			}
			document.getElementById('images').classList.remove('shown');
		}, false);

		document.getElementById('select').addEventListener('click', function() {
			var images = document.getElementById('images');
			if (document.body.classList.contains('sidebar-open')) {
				if (document.body.classList.contains('sidebar-open') && images.classList.contains('shown')) {
					images.classList.remove('shown');
				} else {
					images.classList.add('shown');
				}
			} else {
				document.body.classList.add('sidebar-open');
				images.classList.add('shown');
			}
		}, false);

		document.getElementById('info-button').addEventListener('click', function() {
			document.getElementById('info').classList.add('shown');
		}, false);

		document.getElementById('reset').addEventListener('click', function() {
			reset();
		}, false);

		IMAGES_ORDER.forEach(function(id) {
			var image = IMAGES[id];

			function onclick() {
				save(); // force-save current state
				reload(deserializeFromLocalStorage(id), id);
				document.body.classList.remove('sidebar-open');
				images.classList.remove('shown');
				document.getElementById('info').classList.remove('shown');
			}

			var link = document.createElement('a');
			link.className = 'preview-image';
			link.style.background = 'url(' + image.previewPath + ') center no-repeat';
			link.innerHTML = '<span class="label">' + image.rows + ' &times; ' + image.columns + '</span><span class="progress"></span>';
			link.addEventListener('click', onclick, false);
			document.getElementById('images').appendChild(link);

			var credit = document.createElement('div');
			credit.className = 'image-credit';
			credit.innerHTML = '<p>' + image.source + '</p>';
			var link2 = link.cloneNode(true);
			link2.addEventListener('click', onclick, false);
			credit.insertBefore(link2, credit.firstChild);
			document.querySelector('#info>.inner').appendChild(credit);

			image.progressElements = [link.querySelector('.progress'), link2.querySelector('.progress')];

			var stored = deserializeFromLocalStorage(id);
			if (stored && stored.puzzle.state.forEach) {
				var numGroups = 0;
				stored.puzzle.state.forEach(function(arr) {
					if (arr[0] === 9) ++numGroups;
				});
				updateProgress(id, numGroups - 1, image.rows * image.columns - 1);
			}
		});
	}

	document.addEventListener('DOMContentLoaded', function() {
		window.addEventListener('selectstart', function(e) { e.preventDefault(); });
		window.addEventListener('contextmenu', function(e) { e.preventDefault(); });

		logElement = document.getElementById('log');

		// if the last image is unavailable for any reason,
		// switch to the default image and DO NOT RESET its progress!
		var stored = deserializeFromLocalStorage() || deserializeFromLocalStorage(IMAGES_ORDER[0]);
		var firstTime = !stored;
		initializeDialog(firstTime);
		initializeSidebar();

		var snapSound = new Audio('tick.ogg?20170107a');
		jigsaw = new Jigsaw(document.getElementById('jigsaw'), {
			onStartMove: function(identifier, piece, x, y) {
				// pieces no longer move when completed
				if (completedTime !== null) jigsaw.cancelMove('', identifier);
			},

			onEndMove: function(identifier, piece, x, y) {
				save();
			},

			onSnap: function(mergedGroupIndex, otherGroupIndices) {
				snapSound.play();
				save(); // snapping force-saves the state in order to avoid frustration
				var counter = updateCounter();

				// tracking events
				if (!window._paq) return;
				otherGroupIndices = otherGroupIndices.filter(function(i) { return i !== mergedGroupIndex; });
				var lastRatio = (counter.remaining + otherGroupIndices.length) / counter.total;
				var curRatio = counter.remaining / counter.total;
				var seconds = (accumulatedTime + elapsedSinceStartTime()) / 1000 | 0;
				[10, 25, 50, 75, 100].forEach(function(percent) {
					var threshold = 1 - percent / 100;
					if (lastRatio > threshold && curRatio <= threshold) {
						window._paq.push(['trackEvent', 'JigsawPuzzle', percent + '% completed', currentImage, seconds]);
					}
				});
			}
		});

		try {
			reload(stored, IMAGES_ORDER[0]);
		} catch (e) {
			console.log(e);
			log('Failed to load the state. Clear local storage and try again.');
			return;
		}

		setInterval(save, 1000);
		setInterval(updateTimer, 500);
	});
})(window)

// vim: ts=4 sw=4 sts=4
