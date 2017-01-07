;(function(window) {
	"use strict";

	var SVG_NS = 'http://www.w3.org/2000/svg';
	var XLINK_NS = 'http://www.w3.org/1999/xlink';

	var TOP_SIDE = 0;
	var RIGHT_SIDE = 1;
	var BOTTOM_SIDE = 2;
	var LEFT_SIDE = 3;

	var SNAP_TO_ANY = 1;
	var SNAP_TO_MOVED = 2;
	var SNAP_TO_NOT_MOVED = 3;

	var DATA_JIGSAW = 'data-jigsaw';
	var DATA_JIGSAW_BACKGROUND = 'data-jigsaw-background';
	var DATA_JIGSAW_BOUNDARY = 'data-jigsaw-boundary';
	var DATA_JIGSAW_BOARD = 'data-jigsaw-board';
	var DATA_JIGSAW_PIECE = 'data-jigsaw-piece';
	var DATA_JIGSAW_GROUP = 'data-jigsaw-group';
	var DATA_JIGSAW_GROUP_MOVING = 'data-jigsaw-group-moving';
	var DATA_JIGSAW_GROUP_LOCAL_MOVING = 'data-jigsaw-group-local-moving';

	var STATE_GROUP = 9;

	var currentTime;
	if (window.performance && window.performance.now) {
		currentTime = function() { return window.performance.now(); };
	} else if (window.performance && window.performance.webkitNow) {
		currentTime = function() { return window.performance.webkitNow(); };
	} else {
		currentTime = function() { return +new Date(); };
	}

	// name: 'string' or {ns: ns, s: 'string'}
	// children: [[name, value], element, ...]
	// style: {name: value, ...}
	function makeElement(name, children, style) {
		children = children || [];
		style = style || {};

		var e;
		if (name.ns) {
			e = document.createElementNS(name.ns, name.s);
		} else {
			e = document.createElement(name);
		}
		for (var i = 0; children[i]; ++i) {
			if (children[i].constructor === Array) {
				if (children[i][0].ns) {
					e.setAttributeNS(children[i][0].ns, children[i][0].s, children[i][1]);
				} else {
					e.setAttribute(children[i][0], children[i][1]);
				}
			} else {
				e.appendChild(children[i]);
			}
		}
		for (var k in style) {
			e.style[k] = style[k];
		}
		return e;
	}

	var serialNumber = 0;
	function makeFreshId() {
		var prefix = +new Date() + '-';
		var id;
		do {
			id = prefix + serialNumber++;
		} while (document.getElementById(id) != null);
		return id;
	}

	// HalfSipHash-2-4 with fixed 32-bit input and 64-bit output
	function hash(m, k0, k1) {
		var v0 = k0, v1 = k1, v2 = 0x6c796765 ^ k0, v3 = 0x74656462 ^ k1;
		if (true) v1 ^= 0xee;
		function round() {
			v0 += v1;
			v1 = ((v1 << 5) | (v1 >>> 27)) ^ v0;
			v0 = (v0 << 16) | (v0 >>> 16);
			v2 += v3;
			v3 = ((v3 << 8) | (v3 >>> 24)) ^ v2;
			v0 += v3;
			v3 = ((v3 << 7) | (v3 >>> 25)) ^ v0;
			v2 += v1;
			v1 = ((v1 << 13) | (v1 >>> 19)) ^ v2;
			v2 = (v2 << 16) | (v2 >>> 16);
		}
		v3 ^= m; round(); round(); v0 ^= m;
		m = 0x04000000; // the final chunk
		v3 ^= m; round(); round(); v0 ^= m;
		if (true) {
			v2 ^= 0xee; round(); round(); round(); round();
			var a = (v1 ^ v3) >>> 0;
			v1 ^= 0xdd; round(); round(); round(); round();
			var b = (v1 ^ v3) >>> 0;
			return [a, b];
		} else {
			v2 ^= 0xff; round(); round(); round(); round();
			return (v1 ^ v3) >>> 0;
		}
	}
	if (true) {
		var h = hash(0x03020100, 0x03020100, 0x07060504);
		if (h[0] !== 0x178ae7d5 || h[1] !== 0xa12ee55b) throw 'sanity test failed';
	} else {
		if (hash(0x03020100, 0x03020100, 0x07060504) !== 0x89466e2a) throw 'sanity test failed';
	}

	function nestedMapAdd(m, k1, k2, v) {
		if (!m[k1]) m[k1] = {};
		m[k1][k2] = v;
	}

	function nestedMapGet(m, k1, k2) {
		return (m[k1] || {})[k2];
	}

	function nestedMapRemove(m, k1, k2) {
		var mm = m[k1];
		if (!mm) return null;
		delete mm[k2];

		var empty = true;
		for (var _ in mm) {
			empty = false;
			break;
		}
		if (empty) delete m[k1];
	}

	////////////////////////////////////////////////////////////////////////////////

	//  |<----edgeSize--->|
	//        _______        ___
	//        \     /         |  height
	//   _____|\   /|_____   _|_
	//  |     ||   ||     |
	//        ||<->|| minWidth (determined randomly)
	//        |<--->| maxWidth (not exact, but upper bound)
	function JigsawEnd(seed, edgeSize, maxWidth, height, side) {
		this.seed = seed;
		this.edgeSize = edgeSize;
		this.maxWidth = maxWidth;
		this.height = height;
		this.side = side;
	}

	Object.defineProperty(JigsawEnd.prototype, 'path', {
		get: function() {
			//        0
			//    -------->
			//   ^         |
			//   |         |
			// 3 |         | 1
			//   |         |
			//   |         v
			//    <--------
			//         2
			var vertical = this.side % 2 == 1;
			var lineCmd = vertical ? 'v' : 'h';
			var sideSign = this.side > 1 ? -1 : +1;

			if (this.seed === 0) {
				return lineCmd + (sideSign * this.edgeSize);
			}

			var seedSign = this.seed < 0 ? -1 : +1;

			// due to the property of SipHash, we should fix the key and change the message
			// and not the opposite: it guarantees that without knowing k, the knowledge of
			// x and H(x,k) does not extend to H(y,k) for any unknown y.
			var h = hash(Math.abs(this.seed), 0x26282c6b /* b64 "Jigsaw==" */, 0x3e279c7a /* b64 "Pieces==" */);
			var h0 = h[0], h1 = h[1];
			function random(h, shift, scale) {
				return (((h >> shift) & 15) / 15 - 0.5) * scale;
			}

			var path = [];

			var scaleX = this.maxWidth * sideSign * seedSign;
			var scaleY = -this.height * sideSign * seedSign;
			function curve(x0, y0, x1, y1, x2, y2, x3, y3) {
				if (vertical) {
					path.push(
						(y0 - y1) * scaleY, (x1 - x0) * scaleX,
						(y0 - y2) * scaleY, (x2 - x0) * scaleX,
						(y0 - y3) * scaleY, (x3 - x0) * scaleX);
				} else {
					path.push(
						(x1 - x0) * scaleX, (y1 - y0) * scaleY,
						(x2 - x0) * scaleX, (y2 - y0) * scaleY,
						(x3 - x0) * scaleX, (y3 - y0) * scaleY);
				}
			}

			var minWidth = 0.35 + random(h0, 0, 0.3);
			var half1 = 0.65 + random(h0, 4, 0.3);
			var half2 = 0.65 + random(h0, 8, 0.3);

			var hi1a = -0.5 + random(h1, 28, 0.1);
			var hi1b = -0.5 + random(h1, 24, 0.1);
			var lo1a = -minWidth / 2 + random(h1, 16, 0.1);
			var lo1b = -minWidth / 2 + random(h1, 12, 0.1);
			var mid1a = -(minWidth + 1) / 4 + random(h1, 20, 0.1);
			var mid1b = mid1a + (mid1a - lo1b);
			var hi2a = 0.5 + random(h1, 8, 0.1);
			var hi2b = 0.5 + random(h1, 4, 0.1);
			var lo2a = minWidth / 2 + random(h0, 28, 0.1);
			var mid2a = (minWidth + 1) / 4 + random(h1, 0, 0.1);
			var mid2b = mid2a + (mid2a - hi2a);
			var half1a = half1 + random(h0, 24, 0.1);
			var half1b = half1 + (half1 - half1a);
			var half2a = half2 + random(h0, 20, 0.1);
			var half2b = half2 + (half2 - half2a);

			if (seedSign > 0) {
				path.push(lineCmd);
				path.push((this.edgeSize / 2 + hi1a * this.maxWidth) * sideSign);
				path.push('c');
				curve(hi1a, 1, lo1a, 1, lo1b, half1a, mid1a, half1);
				curve(mid1a, half1, mid1b, half1b, hi1b, 0, 0, 0);
				curve(0, 0, -hi1b, 0, hi2a, half2a, mid2a, half2);
				curve(mid2a, half2, mid2b, half2b, lo2a, 1, hi2b, 1);
				path.push(lineCmd);
				path.push((this.edgeSize / 2 - hi2b * this.maxWidth) * sideSign);
			} else {
				path.push(lineCmd);
				path.push((this.edgeSize / 2 - hi2b * this.maxWidth) * sideSign);
				path.push('c');
				curve(hi2b, 1, lo2a, 1, mid2b, half2b, mid2a, half2);
				curve(mid2a, half2, hi2a, half2a, -hi1b, 0, 0, 0);
				curve(0, 0, hi1b, 0, mid1b, half1b, mid1a, half1);
				curve(mid1a, half1, lo1b, half1a, lo1a, 1, hi1a, 1);
				path.push(lineCmd);
				path.push((this.edgeSize / 2 + hi1a * this.maxWidth) * sideSign);
			}

			return path.join(' ');
		}
	});

	////////////////////////////////////////////////////////////////////////////////

	function JigsawPiece(index, group, imagePath, imageWidth, imageHeight, clipLeft, clipTop, clipWidth, clipHeight, endWidth, endHeight, endSeeds, endIndices) {
		var ends = endSeeds.map(function(seed, side) {
			return new JigsawEnd(seed, side % 2 == 0 ? clipWidth : clipHeight, endWidth, endHeight, side);
		});

		var pathId = makeFreshId();
		var clipPathId = makeFreshId();
		var pieceWidth = clipWidth + endHeight * 2;
		var pieceHeight = clipHeight + endHeight * 2;

		var e = makeElement({ns: SVG_NS, s: 'svg'}, [
			['width', pieceWidth],
			['height', pieceHeight],
			[DATA_JIGSAW_PIECE, index],
			makeElement({ns: SVG_NS, s: 'clipPath'}, [
				['id', clipPathId],
				makeElement({ns: SVG_NS, s: 'path'}, [
					['id', pathId],
					['d', 'M' + endHeight + ' ' + endHeight + ' ' + ends.map(function(end) { return end.path; }).join(' ')]
				])
			]),
			makeElement({ns: SVG_NS, s: 'rect'}, [
				['clip-path', 'url(#' + clipPathId + ')'],
				['x', 0],
				['y', 0],
				['width', pieceWidth],
				['height', pieceHeight],
				['fill', 'white']
			]),
			makeElement({ns: SVG_NS, s: 'image'}, [
				[{ns: XLINK_NS, s: 'href'}, imagePath],
				['clip-path', 'url(#' + clipPathId + ')'],
				['x', endHeight - clipLeft],
				['y', endHeight - clipTop],
				['width', imageWidth],
				['height', imageHeight]
			]),
			makeElement({ns: SVG_NS, s: 'use'}, [
				[{ns: XLINK_NS, s: 'href'}, '#' + pathId]
			])
		], {left: '0px', top: '0px'});
		group.element.appendChild(e);

		this.index = index;
		this.group = group;
		this.element = e;
		this.localLeft = endHeight; // match with e.style.left
		this.localTop = endHeight; // match with e.style.top
		this.clipLeft = clipLeft;
		this.clipTop = clipTop;
		this.clipWidth = clipWidth;
		this.clipHeight = clipHeight;
		this.ends = ends;
		this.endIndices = endIndices;
	}

	Object.defineProperty(JigsawPiece.prototype, 'position', {
		get: function() {
			// global piece position = local piece position in group + group position
			var groupPos = this.group.position;
			return [this.localLeft + groupPos[0], this.localTop + groupPos[1]];
		},
		set: function(pos) {
			// modify the group position to match the requested global piece position
			// (note that localLeft/localTop never changes unless groups are merged)
			this.group.position = [pos[0] - this.localLeft, pos[1] - this.localTop];
		}
	});

	Object.defineProperty(JigsawPiece.prototype, 'localPosition', {
		get: function() {
			return [this.localLeft, this.localTop];
		},
		set: function(pos) {
			this.localLeft = pos[0];
			this.localTop = pos[1];
			var style = this.element.style;
			style.left = (this.localLeft - this.ends[LEFT_SIDE].height) + 'px';
			style.top = (this.localTop - this.ends[TOP_SIDE].height) + 'px';
		}
	});

	JigsawPiece.prototype.getOffsetFrom = function(side, other) {
		var position = this.position;
		var otherPosition = other.position;
		var deltaX = otherPosition[0] - position[0];
		var deltaY = otherPosition[1] - position[1];
		switch (side) {
			case TOP_SIDE: deltaY += other.clipHeight; break;
			case RIGHT_SIDE: deltaX -= this.clipWidth; break;
			case BOTTOM_SIDE: deltaY -= this.clipHeight; break;
			case LEFT_SIDE: deltaX += other.clipWidth; break;
		}
		return [deltaX, deltaY];
	};

	////////////////////////////////////////////////////////////////////////////////

	function JigsawGroup(index, pieceIndices) {
		// z-index is recalculated from Jigsaw
		var e = makeElement('span', [[DATA_JIGSAW_GROUP, index]], {zIndex: 0});

		this.index = index;
		this.weight = 0; // recalculated from Jigsaw
		this.element = e;
		this.globalLeft = 0;
		this.globalTop = 0;
		this.pieceIndices = pieceIndices;
		this.cursors = {};
	}

	Object.defineProperty(JigsawGroup.prototype, 'length', {
		get: function() { return this.pieceIndices.length; }
	});

	Object.defineProperty(JigsawGroup.prototype, 'position', {
		get: function() {
			return [this.globalLeft, this.globalTop];
		},
		set: function(pos) {
			if (pos[0] === this.globalLeft && pos[1] === this.globalTop) return;
			this.globalLeft = pos[0];
			this.globalTop = pos[1];
			this.element.style.transform = 'translate(' + this.globalLeft + 'px,' + this.globalTop + 'px)';
		}
	});

	////////////////////////////////////////////////////////////////////////////////

	function Jigsaw(parent, options) {
		this.parent = parent;
		this.imageWidth = options.imageWidth;
		this.imageHeight = options.imageHeight;
		this.imagePath = options.imagePath;
		this.boardWidth = options.boardWidth;
		this.boardHeight = options.boardHeight;
		this.rows = options.rows;
		this.columns = options.columns;

		// [s] any touch gesture will be resolved to one- or two-finger touch after this interval.
		this.touchGestureLatency = options.touchGestureLatency || 0.1;
		// [px] the interval of background grids.
		this.gridInterval = options.gridInterval || 100;
		// snapping will merge other groups of pieces into the group with the largest num of pieces;
		// this option determines which groups are considered for the "largest" group.
		this.snapMode = {
			'any': SNAP_TO_ANY, // any largest group being merged
			'moved': SNAP_TO_MOVED, // the group that has triggered snapping (there's only one)
			'not-moved': SNAP_TO_NOT_MOVED // any non-moving largest group being merged
		}[options.snapMode] || SNAP_TO_NOT_MOVED;
		// [px or ratio] the maximum distance between groups of pieces to be snapped.
		// defaults to pixels; if <= 1, it is a ratio to the shorter side of each piece.
		this.snapThreshold = options.snapThreshold || 0.25;
		// a function from the number of pieces to the "weight",
		// a ratio of group displacements to cursor displacements (defaults to 1).
		this.weightFunc = options.weightFunc;
		// [px] auto-scrolling will be triggered when the cursor is up to this distance from edges.
		this.autoScrollBorderSizeOnEdge = options.autoScrollBorderSizeOnEdge || 30;
		// a function from the distance from edges to the auto-scrolling amounts [px].
		// defaults to `borderSize - max(0, distance)`.
		this.autoScrollAmountFunc = options.autoScrollAmountFunc;
		// the maximum scale factor (1 is fully zoomed out, henceforth "inverse zoom") allowed.
		// note that the minimum scale factor is always 1 in order to avoid aliasing artifacts.
		this.maxInvZoom = options.maxInvZoom || 4;
		// the amount of scale factor changes on wheel (which is constant except for the direction).
		this.wheelZoomIncrement = options.wheelZoomIncrement || 0.05;
		// [ratio] only enable pinch zoom with touch when the distance between two fingers changes
		// more than this proportion of the shorter side of the client area.
		this.touchZoomChangeThreshold = options.touchZoomChangeThreshold || 0.2;

		this.onStartMove = options.onStartMove;
		this.onUpdateMove = options.onUpdateMove;
		this.onEndMove = options.onEndMove;
		this.onCancelMove = options.onCancelMove;
		this.onSnap = options.onSnap;

		this.ongoingMoves = {};
		this.seed = options.seed;
		if (typeof this.seed === 'undefined') {
			this.seed = Math.random() * 4294967296 >>> 0;
		}
	}

	// those two methods can be customized or overriden if you really want to.
	Jigsaw.prototype.hash = hash;
	Jigsaw.prototype.now = currentTime;

	Jigsaw.prototype.deriveEndSeeds = function() {
		var seed = this.seed;

		var index = 0;
		var last = -1; // non-negative
		var seen = {}; // we don't want duplicate ends
		var nextHash = function() {
			var h;
			do {
				if (last >= 0) {
					h = last;
					last = -1;
				} else {
					var hh = this.hash(index++, 0x3eecf395 /* b64 "Puzzle==" */, seed);
					// will convert to signed integer for determining the convex/concave end
					h = hh[0] | 0;
					last = hh[1] | 0;
				}
			} while (h !== 0 && seen[Math.abs(h)]);
			seen[Math.abs(h)] = true;
			return h;
		}.bind(this);

		this.horizontalSeeds = []; // rows-1 by columns
		this.verticalSeeds = []; // rows by columns-1
		for (var y = 0; y < this.rows - 1; ++y) {
			var row = [];
			for (var x = 0; x < this.columns; ++x) row.push(nextHash());
			this.horizontalSeeds.push(row);
		}
		for (var y = 0; y < this.rows; ++y) {
			var row = [];
			for (var x = 0; x < this.columns - 1; ++x) row.push(nextHash());
			this.verticalSeeds.push(row);
		}
	};

	// can only be called after finalize or after the initial construction
	Jigsaw.prototype.initialize = function(state) {
		this.deriveEndSeeds();

		this.groups = {};

		// recover piece-to-group mapping from the state
		var numPieces = this.rows * this.columns;
		var initialGroups = {}; // pieceIndex: groupIndex
		var orderedGroups = []; // the same order as the state
		if (state) {
			state.forEach(function(arr) {
				if (arr[0] !== STATE_GROUP || arr.length < 4) return;

				var groupIndex = arr[1];
				if (groupIndex < 0 || groupIndex >= numPieces) throw 'bad state';
				if (initialGroups.hasOwnProperty(groupIndex)) throw 'bad state';
				initialGroups[groupIndex] = groupIndex;

				var pieceIndices = [groupIndex];
				for (var i = 4; i < arr.length; ++i) {
					if (arr[i] < 0 || arr[i] >= numPieces) throw 'bad state';
					if (initialGroups.hasOwnProperty(arr[i])) throw 'bad state';
					initialGroups[arr[i]] = groupIndex;
					pieceIndices.push(arr[i]);
				}

				var group = new JigsawGroup(groupIndex, pieceIndices);
				group.position = [arr[2], arr[3]]; // not yet clipped!
				this.groups[groupIndex] = group;
				orderedGroups.push(group);
			}.bind(this));
		}

		// each piece not mapped to any group forms its own group
		for (var i = 0; i < numPieces; ++i) {
			if (initialGroups.hasOwnProperty(i)) continue;
			initialGroups[i] = i;
			var group = new JigsawGroup(i, [i]);
			this.groups[i] = group;
			orderedGroups.push(group);
		}

		// create backgroundElement
		var gradientId = makeFreshId();
		var patternId = makeFreshId();
		this.backgroundGradientElement = makeElement({ns: SVG_NS, s: 'radialGradient'}, [
			['id', gradientId],
			['gradientUnits', 'userSpaceOnUse'],
			['cx', 0],
			['cy', 0],
			['r', Math.min(this.boardWidth, this.boardHeight)],
			makeElement({ns: SVG_NS, s: 'stop'}, [['offset', '0%'], ['stop-color', '#40404020']]),
			makeElement({ns: SVG_NS, s: 'stop'}, [['offset', '100%'], ['stop-color', '#404040ff']])
		]);
		this.backgroundPatternElement = makeElement({ns: SVG_NS, s: 'pattern'}, [
			['id', patternId],
			['patternUnits', 'userSpaceOnUse'],
			['x', '50%'],
			['y', '50%'],
			['width', this.gridInterval],
			['height', this.gridInterval],
			makeElement({ns: SVG_NS, s: 'path'}, [
				['d', 'M0 0H' + this.gridInterval + 'M0 0V' + this.gridInterval],
				['stroke-width', 1],
				['stroke', 'url(#' + gradientId + ')']
			])
		]);
		this.backgroundElement = makeElement({ns: SVG_NS, s: 'svg'}, [
			['width', '100%'],
			['height', '100%'],
			['overflow', 'visible'],
			[DATA_JIGSAW_BACKGROUND, ''],
			makeElement({ns: SVG_NS, s: 'defs'}, [
				this.backgroundGradientElement,
				this.backgroundPatternElement
			]),
			makeElement({ns: SVG_NS, s: 'rect'}, [
				['fill', 'url(#' + patternId + ')'],
				['overflow', 'visible'],
				['width', '100%'],
				['height', '100%']
			])
		]);
		this.parent.appendChild(this.backgroundElement);

		// create boardElement
		this.boardLeft = 0;
		this.boardTop = 0;
		this.boardInvZoom = 1;
		this.boardElement = makeElement('div', [
			[DATA_JIGSAW_BOARD, ''],
			makeElement('div', [
				[DATA_JIGSAW_BOUNDARY, '']
			], {
				width: this.boardWidth * 2 + 'px',
				height: this.boardHeight * 2 + 'px',
				left: -this.boardWidth + 'px',
				top: -this.boardHeight + 'px'
			})
		]);
		this.parent.appendChild(this.boardElement);
		this.parent.setAttribute(DATA_JIGSAW, '');

		var lefts = [], widths = [];
		for (var x = 0, left = 0; x < this.columns; ++x) {
			var nextLeft = this.imageWidth * (x + 1) / this.columns | 0;
			lefts.push(left);
			widths.push(nextLeft - left);
			left = nextLeft;
		}
		var tops = [], heights = [];
		for (var y = 0, top = 0; y < this.rows; ++y) {
			var nextTop = this.imageHeight * (y + 1) / this.rows | 0;
			tops.push(top);
			heights.push(nextTop - top);
			top = nextTop;
		}

		var minSide = Math.min(Math.min.apply(null, widths), Math.min.apply(null, heights));
		var endWidth = minSide * 0.5 | 0;
		var endHeight = minSide * 0.3 | 0;
		if (this.snapThreshold <= 1) {
			this.snapThreshold = minSide * this.snapThreshold | 0;
		}

		// create initial svg elements
		this.pieces = [];
		for (var y = 0; y < this.rows; ++y) {
			for (var x = 0; x < this.columns; ++x) {
				var index = y * this.columns + x;
				var topEnd = 0, rightEnd = 0, bottomEnd = 0, leftEnd = 0;
				var topIndex = -1, rightIndex = -1, bottomIndex = -1, leftIndex = -1;
				if (x > 0) {
					leftEnd = this.verticalSeeds[y][x-1];
					leftIndex = index - 1;
				}
				if (x < this.columns - 1) {
					rightEnd = -this.verticalSeeds[y][x];
					rightIndex = index + 1;
				}
				if (y > 0) {
					topEnd = this.horizontalSeeds[y-1][x];
					topIndex = index - this.columns;
				}
				if (y < this.rows - 1) {
					bottomEnd = -this.horizontalSeeds[y][x];
					bottomIndex = index + this.columns;
				}

				var piece = new JigsawPiece(index, this.groups[initialGroups[index]],
					this.imagePath, this.imageWidth, this.imageHeight,
					lefts[x], tops[y], widths[x], heights[y], endWidth, endHeight,
					[topEnd, rightEnd, bottomEnd, leftEnd],
					[topIndex, rightIndex, bottomIndex, leftIndex]);
				this.pieces.push(piece);
			}
		}

		// attach group elements to the DOM and adjust the piece positions
		orderedGroups.forEach(function(group) {
			var groupPiece = this.pieces[group.index];
			group.pieceIndices.forEach(function(pieceIndex) {
				var piece = this.pieces[pieceIndex];
				piece.localPosition = [piece.clipLeft - groupPiece.clipLeft, piece.clipTop - groupPiece.clipTop];
			}.bind(this));

			// the state may have been not properly clipped, so we handle them here.
			// we cannot do at the initialization because this.pieces is not yet initialized there.
			group.position = this.clipGroupPosition(group, group.globalLeft, group.globalTop);

			this.updateGroupWeightAndZIndex(group, false);

			this.boardElement.appendChild(group.element);
		}.bind(this));

		this.installMouseEvents();
		this.installTouchEvents();
	};

	Object.defineProperty(Jigsaw.prototype, 'boardPosition', {
		get: function() {
			return { x: this.boardLeft, y: this.boardTop, z: this.boardInvZoom };
		},

		set: function(pos) {
			// clip to the board size
			var left = Math.min(Math.max(pos.x, -this.boardWidth), this.boardWidth);
			var top = Math.min(Math.max(pos.y, -this.boardHeight), this.boardHeight);
			var invZoom = Math.min(Math.max(pos.z, 1), this.maxInvZoom);

			if (left === this.boardLeft && top === this.boardTop && invZoom === this.boardInvZoom) return;

			this.boardLeft = left;
			this.boardTop = top;
			this.boardInvZoom = invZoom;
			this.boardElement.style.transform = 'scale(' + 1 / this.boardInvZoom + ') translate(' + this.boardLeft + 'px,' + this.boardTop + 'px) translate(50%, 50%)';

			// unlike boardElement, backgroundElement forms its own layer and will-change is not set
			this.backgroundGradientElement.setAttribute('cx', left / invZoom);
			this.backgroundGradientElement.setAttribute('cy', top / invZoom);
			this.backgroundGradientElement.setAttribute('r', Math.min(this.boardWidth, this.boardHeight) / invZoom);
			this.backgroundPatternElement.setAttribute('patternTransform', 'translate(' + left / invZoom + ',' + top / invZoom + ')');
			this.backgroundPatternElement.setAttribute('width', this.gridInterval / invZoom);
			this.backgroundPatternElement.setAttribute('height', this.gridInterval / invZoom);
		}
	});

	Jigsaw.prototype.randomizePiecePositions = function(left, top, right, bottom) {
		this.pieces.forEach(function(piece) {
			var topEnd = piece.ends[TOP_SIDE].height;
			var rightEnd = piece.ends[RIGHT_SIDE].height;
			var bottomEnd = piece.ends[BOTTOM_SIDE].height;
			var leftEnd = piece.ends[LEFT_SIDE].height;

			piece.position = [
				(left + leftEnd + Math.random() * (right - left - piece.clipWidth - leftEnd - rightEnd)) | 0,
				(top + topEnd + Math.random() * (bottom - top - piece.clipHeight - topEnd - bottomEnd)) | 0];
		}.bind(this));
	};

	Jigsaw.prototype.serializeState = function() {
		// [[STATE_GROUP, groupIndex, groupLeft, groupTop, (other) pieceIndex, ...], ...]
		// groupLeft/groupTop refers to the global piece position for the groupIndex.
		// local positions are not explicitly recorded; can be recovered from parameters.
		// the order of groups is significant; later groups are placed over earlier groups.

		var state = [];

		// preserve the group order
		var groupElements = this.boardElement.childNodes;
		for (var i = 0, groupElement; groupElement = groupElements[i]; ++i) {
			var groupIndex = groupElement.getAttribute(DATA_JIGSAW_GROUP);
			if (!groupIndex) continue;
			groupIndex = +groupIndex;
			var group = this.groups[groupIndex];

			var arr = [STATE_GROUP, groupIndex, group.globalLeft, group.globalTop];
			group.pieceIndices.forEach(function(pieceIndex) {
				if (pieceIndex !== groupIndex) arr.push(pieceIndex);
			});
			state.push(arr);
		}

		return state;
	};

	Jigsaw.prototype.translateToViewport = function(e) {
		var rect = this.parent.getBoundingClientRect();
		return {
			left: e.pageX - window.pageXOffset - (rect.right + rect.left) / 2,
			top: e.pageY - window.pageYOffset - (rect.bottom + rect.top) / 2
		};
	};

	Jigsaw.prototype.pieceIndexFromTargetElement = function(target) {
		var pieceData = null;
		var parentData = null;
		while (target && pieceData === null && parentData === null) {
			pieceData = target.getAttribute(DATA_JIGSAW_PIECE);
			parentData = target.getAttribute(DATA_JIGSAW);
			target = target.parentNode;
		}
		return (pieceData !== null ? +pieceData : -1);
	};

	Jigsaw.prototype.installMouseEvents = function() {
		// https://stackoverflow.com/a/1745382/225272
		this.parent.unselectable = 'on';

		var onselectstart;
		this.parent.addEventListener('selectstart', onselectstart = function() {
			return false;
		}, false);

		var oncontextmenu;
		this.parent.addEventListener('contextmenu', oncontextmenu = function(e) {
			e.preventDefault();
		}, false);

		var onmousedown;
		this.parent.addEventListener('mousedown', onmousedown = function(e) {
			e.preventDefault();

			var movingPiece = false, movingBoard = false;
			if (e.button === 0) {
				if (e.ctrlKey) {
					// Chrome does not consider Ctrl+click in macOS to be right click
					movingBoard = true;
				} else {
					movingPiece = true;
				}
			} else if (e.button === 1 || e.button === 2) {
				movingBoard = true;
			}

			var endMove, updateMove;
			if (movingPiece) {
				var index = this.pieceIndexFromTargetElement(e.target);
				if (index < 0) return;

				var group = this.pieces[index].group;
				if (group.cursors['']) return;
				var pos = this.translateToViewport(e);
				if (!this.startMove('', 0, index, pos.left * this.boardInvZoom - this.boardLeft, pos.top * this.boardInvZoom - this.boardTop)) return;

				updateMove = function(e) {
					var pos = this.translateToViewport(e);
					if (this.updateMove('', 0, pos.left * this.boardInvZoom - this.boardLeft, pos.top * this.boardInvZoom - this.boardTop)) {
						this.scrollOnEdge([[e.pageX, e.pageY]]);
						return true;
					} else {
						return false;
					}
				}.bind(this);

				endMove = function(e) {
					var pos = this.translateToViewport(e);
					if (this.endMove('', 0, pos.left * this.boardInvZoom - this.boardLeft, pos.top * this.boardInvZoom - this.boardTop)) {
						this.scrollOnEdge([[e.pageX, e.pageY]]);
					}
				}.bind(this);
			} else if (movingBoard) {
				// fine to use clientX/Y; we never directly rely on these
				var startBoardLeft = this.boardLeft;
				var startBoardTop = this.boardTop;
				var startClientX = e.clientX;
				var startClientY = e.clientY;

				updateMove = function(e) {
					this.boardPosition = {
						x: startBoardLeft + (e.clientX - startClientX) * this.boardInvZoom,
						y: startBoardTop + (e.clientY - startClientY) * this.boardInvZoom,
						z: this.boardInvZoom
					};
					return true;
				}.bind(this);

				endMove = function(e) {};
			} else {
				return;
			}

			e.stopPropagation();

			var prevButton = e.button;
			var d = document.documentElement;
			function uninstall() {
				d.removeEventListener('mousemove', onmousemove, true);
				d.removeEventListener('mouseup', onmouseup, true);
				if (d.releaseCapture) d.releaseCapture();
			}
			function onmousemove(e) {
				if (!updateMove(e)) uninstall();
			}
			function onmouseup(e) {
				e.preventDefault();

				// if we are moving both piece and board (by pressing two buttons at once),
				// mouseup will only end one of them. but if we are moving board by pressing
				// two buttons at once (middle + right) any mouseup will end moving.
				// also, some browsers (e.g. macOS Firefox) translate ctrl + click as right-click,
				// but if ctrl is released then they emit left-click on mouse release.
				// we counter this kind of issues by resetting all moves when no button is being pressed.
				if (prevButton === e.button || (prevButton === 1 && e.button === 2) || (prevButton === 2 && e.button === 1) || e.buttons === 0) {
					uninstall();
					endMove(e);
				}
			}
			d.addEventListener('mousemove', onmousemove, true);
			d.addEventListener('mouseup', onmouseup, true);
			if (d.setCapture) d.setCapture();
		}.bind(this), false);

		var onwheel;
		this.parent.addEventListener('wheel', onwheel = function(e) {
			e.preventDefault();
			e.stopPropagation();

			if (e.ctrlKey) {
				// zoom mode. we need ctrl as it is hard to distinguish
				// 2D wheels (e.g. touchpads) from normal 1D wheel.
				var deltaZ = (e.deltaY > 0 ? this.wheelZoomIncrement : e.deltaY < 0 ? -this.wheelZoomIncrement : 0);
				this.boardPosition = {
					x: this.boardLeft,
					y: this.boardTop,
					z: this.boardInvZoom + deltaZ
				};
			} else {
				// https://stackoverflow.com/q/20110224/225272
				// deltaMode is full of ambiguity and strangeness. we just use a reasonable default.
				var deltaX = e.deltaX, deltaY = e.deltaY;
				if (e.deltaMode === 1) { // DOM_DELTA_LINE
					deltaX *= 40;
					deltaY *= 40;
				} else if (e.deltaMode === 2) { // DOM_DELTA_PAGE
					deltaX *= 800;
					deltaY *= 800;
				}

				this.boardPosition = {
					x: this.boardLeft - deltaX * this.boardInvZoom,
					y: this.boardTop - deltaY * this.boardInvZoom,
					z: this.boardInvZoom
				};
			}
		}.bind(this), false);

		this.uninstallMouseEvents = function() {
			delete this.parent.unselectable;
			this.parent.removeEventListener('selectstart', onselectstart, false);
			this.parent.removeEventListener('contextmenu', oncontextmenu, false);
			this.parent.removeEventListener('mousedown', onmousedown, false);
			this.parent.removeEventListener('wheel', onwheel, false);
		};
	};

	Jigsaw.prototype.installTouchEvents = function() {
		// the initial state. persists at most this.touchGestureLatency seconds.
		// the initial event is stored so that it is replayed when transitioning to other states.
		//
		// fields: start, viewportX/Y, boardLeft/Top/InvZoom
		// where start = {when, index (or -1), viewportX/Y, boardLeft/Top/InvZoom}
		var DELAYED = 0;

		// a single-point touch, moves pieces if any (multiple allowed).
		// the offset is handled directly by this.ongoingMoves (hence no deltaX/deltaY).
		//
		// fields: index
		var ONE = 1;

		// a double-point touch with 2 points remaining, moves boards.
		// when other double-point touch is enabled, further double-point touches are ignored.
		// the offset is calculated from averaging two points;
		// the last viewportX/Y for each point is stored to do the average.
		//
		// fields: other, start (shared for both touches), viewportX/Y
		// where start = {midViewportX/Y, distance, zoomEnabled, boardLeft/Top/InvZoom}
		var TWO = 2;

		// a double-point touch with 1 point remaining, still moves boards.
		// when transitioning from TWO to TWO_MINUS_ONE,
		// the offset is recalculated to maintain the continuity.
		//
		// fields: viewportX/Y, boardLeft/Top
		var TWO_MINUS_ONE = 3;

		var touches = {}; // identifier: {state, ...other state-dependent fields...}
		var delayedTouchIdentifier = null; // the only id s.t. touches[id].state === DELAYED
		var boardIsMoving = false;

		function translateIdentifier(id) {
			// we remap touch identifiers to avoid 0 (the mouse)
			return (id < 0 ? id : id + 1);
		}

		var boardPositionFromTwoTouches = function(t1, t2) {
			var midViewportX = (t1.viewportX + t2.viewportX) / 2;
			var midViewportY = (t1.viewportY + t2.viewportY) / 2;
			var distanceX = t1.viewportX - t2.viewportX;
			var distanceY = t1.viewportY - t2.viewportY;
			var distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
			if (!t1.start.zoomEnabled) {
				var rect = this.parent.getBoundingClientRect();
				var minSide = Math.min(rect.right - rect.left, rect.bottom - rect.top);
				t1.start.zoomEnabled = Math.abs(t1.start.distance - distance) > minSide * this.touchZoomChangeThreshold;
			}
			var invZoom = (t1.start.zoomEnabled ? t1.start.boardInvZoom * t1.start.distance / distance : this.boardInvZoom);

			return {
				x: t1.start.boardLeft + (midViewportX - t1.start.midViewportX) * invZoom,
				y: t1.start.boardTop + (midViewportY - t1.start.midViewportY) * invZoom,
				z: invZoom
			};
		}.bind(this);

		// this can get called any time
		var lastTimer = -1;
		var checkDelayedTouch = function(now) {
			if (delayedTouchIdentifier === null) return;

			var touch = touches[delayedTouchIdentifier];
			var remaining = touch.start.when - now + this.touchGestureLatency * 1000;
			if (remaining <= 0) {
				// the touch will move to ONE state
				delete touches[delayedTouchIdentifier];
				var identifier = delayedTouchIdentifier;
				delayedTouchIdentifier = null;

				// check if the given piece is already moving
				var pieceIndex = touch.start.index;
				if (pieceIndex < 0) return; // not moving any piece, cancel the touch

				var group = this.pieces[pieceIndex].group;
				if (group.cursors['']) return; // cancel the touch, do not emit any event

				// the touch *does* start from the initial event, it had only got delayed
				var startX = touch.start.viewportX * touch.start.boardInvZoom - touch.start.boardLeft;
				var startY = touch.start.viewportY * touch.start.boardInvZoom - touch.start.boardTop;
				if (!this.startMove('', identifier, touch.start.index, startX, startY)) return;

				var x = touch.viewportX * touch.boardInvZoom - touch.boardLeft;
				var y = touch.viewportY * touch.boardInvZoom - touch.boardTop;
				if (startX !== x || startY !== y) {
					// the cursor has moved during the delay, issue the update
					this.updateMove('', identifier, x, y);
				}
				touches[identifier] = { state: ONE, index: pieceIndex };
			} else {
				// wake me when the delayed touch expires
				if (lastTimer >= 0) clearTimeout(lastTimer);
				lastTimer = setTimeout(function() {
					checkDelayedTouch(this.now());
				}.bind(this), remaining);
			}
		}.bind(this);

		var ontouchstart = function(e) {
			e.preventDefault();
			e.stopPropagation();

			var now = this.now();
			for (var i = 0, t; t = e.changedTouches[i]; ++i) {
				var identifier = translateIdentifier(t.identifier);

				// check if this new touch is paired to prior delayed touch
				if (delayedTouchIdentifier === null) {
					delayedTouchIdentifier = identifier;

					var index = this.pieceIndexFromTargetElement(t.target);
					var pos = this.translateToViewport(t);
					touches[identifier] = {
						state: DELAYED,
						start: {
							when: now,
							index: index,
							viewportX: pos.left,
							viewportY: pos.top,
							boardLeft: this.boardLeft,
							boardTop: this.boardTop,
							boardInvZoom: this.boardInvZoom
						},
						viewportX: pos.left,
						viewportY: pos.top,
						boardLeft: this.boardLeft,
						boardTop: this.boardTop,
						boardInvZoom: this.boardInvZoom
					};
				} else {
					var otherIdentifier = delayedTouchIdentifier;
					delayedTouchIdentifier = null;

					if (boardIsMoving) {
						// cancel the prior touch
						delete touches[otherIdentifier];
					} else {
						var otherTouch = touches[otherIdentifier];

						// the prior touch may have moved the board already,
						// use the starting pos (as opposed to the current pos) as an origin
						this.boardPosition = {
							x: this.boardLeft + (otherTouch.viewportX - otherTouch.start.viewportX) * this.boardInvZoom,
							y: this.boardTop + (otherTouch.viewportY - otherTouch.start.viewportY) * this.boardInvZoom,
							z: this.boardInvZoom
						};

						var pos = this.translateToViewport(t);
						var distanceX = pos.left - otherTouch.viewportX;
						var distanceY = pos.top - otherTouch.viewportY;
						var start = {
							midViewportX: (pos.left + otherTouch.viewportX) / 2,
							midViewportY: (pos.top + otherTouch.viewportY) / 2,
							distance: Math.sqrt(distanceX * distanceX + distanceY * distanceY),
							zoomEnabled: false,
							boardLeft: this.boardLeft,
							boardTop: this.boardTop,
							boardInvZoom: this.boardInvZoom
						};

						touches[otherIdentifier] = {
							state: TWO,
							other: identifier,
							start: start,
							viewportX: otherTouch.start.viewportX,
							viewportY: otherTouch.start.viewportY
						};
						touches[identifier] = {
							state: TWO,
							other: otherIdentifier,
							start: start,
							viewportX: pos.left,
							viewportY: pos.top
						};

						boardIsMoving = true;
					}
				}
			}

			checkDelayedTouch(now);
		}.bind(this);

		var ontouchmove = function(e) {
			e.preventDefault();

			var updateMoves = []; // delay updates after the board moves
			for (var i = 0, t; t = e.changedTouches[i]; ++i) {
				var identifier = translateIdentifier(t.identifier);
				var touch = touches[identifier];
				if (!touch) continue;

				var pos = this.translateToViewport(t);
				switch (touch.state) {
					case DELAYED:
						touch.viewportX = pos.left;
						touch.viewportY = pos.top;
						touch.boardLeft = this.boardLeft;
						touch.boardTop = this.boardTop;
						break;

					case ONE:
						updateMoves.push({ i: identifier, p: pos, t: t });
						break;

					case TWO:
						// may occur twice, should be fine
						touch.viewportX = pos.left;
						touch.viewportY = pos.top;
						this.boardPosition = boardPositionFromTwoTouches(touch, touches[touch.other]);
						break;

					case TWO_MINUS_ONE:
						this.boardPosition = {
							x: touch.boardLeft + (pos.left - touch.viewportX) * this.boardInvZoom,
							y: touch.boardTop + (pos.top - touch.viewportY) * this.boardInvZoom,
							z: this.boardInvZoom
						};
						break;
				}
			}

			updateMoves = updateMoves.filter(function(t) {
				if (this.updateMove('', t.i, t.p.left * this.boardInvZoom - this.boardLeft, t.p.top * this.boardInvZoom - this.boardTop)) {
					return true;
				} else {
					delete touches[t.i];
					return false;
				}
			}.bind(this));
			this.scrollOnEdge(updateMoves.map(function(t) { return [t.t.pageX, t.t.pageY]; }));
		}.bind(this);

		// also ontouchcancel (it is impossible to cancel their effects)
		var ontouchend = function(e) {
			e.preventDefault();

			var endMoves = []; // delay updates after the board moves
			for (var i = 0, t; t = e.changedTouches[i]; ++i) {
				var identifier = translateIdentifier(t.identifier);
				var touch = touches[identifier];
				if (!touch) continue;
				delete touches[identifier];

				var pos = this.translateToViewport(t);
				switch (touch.state) {
					case DELAYED:
						delayedTouchIdentifier = null;
						break;

					case ONE:
						endMoves.push({ i: identifier, p: pos, t: t });
						break;

					case TWO:
						// invZoom is now fixed to this value and no longer changes
						var otherTouch = touches[touch.other];
						this.boardPosition = boardPositionFromTwoTouches(touch, otherTouch);
						touches[touch.other] = {
							state: TWO_MINUS_ONE,
							viewportX: otherTouch.viewportX,
							viewportY: otherTouch.viewportY,
							boardLeft: this.boardLeft,
							boardTop: this.boardTop
						};
						break;

					case TWO_MINUS_ONE:
						boardIsMoving = false;
						this.boardPosition = {
							x: touch.boardLeft + (pos.left - touch.viewportX) * this.boardInvZoom,
							y: touch.boardTop + (pos.top - touch.viewportY) * this.boardInvZoom,
							z: this.boardInvZoom
						};
						break;
				}
			}

			endMoves = endMoves.filter(function(t) {
				return this.endMove('', t.i, t.p.left * this.boardInvZoom - this.boardLeft, t.p.top * this.boardInvZoom - this.boardTop);
			}.bind(this));
			this.scrollOnEdge(updateMoves.map(function(t) { return [t.t.pageX, t.t.pageY]; }));
		}.bind(this);

		this.parent.addEventListener('touchstart', ontouchstart, false);
		this.parent.addEventListener('touchmove', ontouchmove, false);
		this.parent.addEventListener('touchend', ontouchend, false);
		this.parent.addEventListener('touchcancel', ontouchend, false);

		this.uninstallTouchEvents = function() {
			this.parent.removeEventListener('touchstart', ontouchstart, false);
			this.parent.removeEventListener('touchmove', ontouchmove, false);
			this.parent.removeEventListener('touchend', ontouchend, false);
			this.parent.removeEventListener('touchcancel', ontouchend, false);
		};
	};

	Jigsaw.prototype.scrollOnEdge = function(pageCoords) {
		if (pageCoords.Coords === 0) return;

		var scrollX = window.pageXOffset;
		var scrollY = window.pageYOffset;
		var rect = this.parent.getBoundingClientRect();

		var leftDistance = Number.POSITIVE_INFINITY;
		var rightDistance = Number.POSITIVE_INFINITY;
		var topDistance = Number.POSITIVE_INFINITY;
		var bottomDistance = Number.POSITIVE_INFINITY;
		pageCoords.forEach(function(pos) {
			// due to the event handling process, we need to first get pageX/Y,
			// then convert it to viewport-local coordinates (by subtracting scrollX/Y),
			// then finally to parent-local coordinates.
			var clientX = pos[0] - scrollX;
			var clientY = pos[1] - scrollY;
			leftDistance = Math.min(leftDistance, clientX - rect.left);
			rightDistance = Math.min(rightDistance, rect.right - clientX);
			topDistance = Math.min(topDistance, clientY - rect.top);
			bottomDistance = Math.min(bottomDistance, rect.bottom - clientY);
		});

		var borderSize = this.autoScrollBorderSizeOnEdge;
		var amountFunc = this.autoScrollAmountFunc || function(amount) {
			return borderSize - Math.max(0, amount);
		};
		var leftAmount = leftDistance < borderSize ? amountFunc(leftDistance) : 0;
		var rightAmount = rightDistance < borderSize ? amountFunc(rightDistance) : 0;
		var topAmount = topDistance < borderSize ? amountFunc(topDistance) : 0;
		var bottomAmount = bottomDistance < borderSize ? amountFunc(bottomDistance) : 0;

		this.boardPosition = {
			x: this.boardLeft + (leftAmount - rightAmount) * this.boardInvZoom,
			y: this.boardTop + (topAmount - bottomAmount) * this.boardInvZoom,
			z: this.boardInvZoom
		};
	};

	// removes all DOM elements, event listeners and piece positions
	Jigsaw.prototype.finalize = function() {
		if (this.uninstallMouseEvents) {
			this.uninstallMouseEvents();
			delete this.uninstallMouseEvents;
		}
		if (this.uninstallTouchEvents) {
			this.uninstallTouchEvents();
			delete this.uninstallTouchEvents;
		}
		if (this.boardElement) {
			this.parent.removeChild(this.boardElement);
			delete this.boardElement;
		}
		if (this.backgroundElement) {
			this.parent.removeChild(this.backgroundElement);
			delete this.backgroundElement;
			delete this.backgroundGradientElement;
			delete this.backgroundPatternElement;
		}
		delete this.boardLeft;
		delete this.boardTop;
		delete this.groups;
		delete this.pieces;
		delete this.horizontalSeeds;
		delete this.verticalSeeds;
	};

	// clip x and y to the board size, accounting for the group's own size
	Jigsaw.prototype.clipGroupPosition = function(group, x, y) {
		group.pieceIndices.forEach(function(pieceIndex) {
			var piece = this.pieces[pieceIndex];
			x = Math.min(Math.max(x, -this.boardWidth - piece.localLeft), this.boardWidth - piece.localLeft - piece.clipWidth);
			y = Math.min(Math.max(y, -this.boardHeight - piece.localTop), this.boardHeight - piece.localTop - piece.clipHeight);
		}.bind(this));

		return [x, y];
	};

	Jigsaw.prototype.updateGroupWeightAndZIndex = function(group, moving) {
		group.weight = (this.weightFunc ? Math.max(1, this.weightFunc(group.pieceIndices.length)) : 1);

		// z-index 1..(r*c-1): lower layer, non-moving groups
		// z-index (r*c+1)..(2*r*c): upper layer, moving groups
		// in each layer groups are sorted by a decreasing order of # of pieces in those groups.
		var numPieces = this.rows * this.columns;
		group.element.style.zIndex = (moving ? 2 : 1) * numPieces - group.pieceIndices.length;
	};

	Jigsaw.prototype.updateGroupPositionFromExistingCursors = function(group) {
		var weight = group.weight;

		// each cursor remembers the desired position of given piece (which may vary),
		// so one can calculate the desired *average* position of given group (which is same)
		var numCursors = 0;
		var totalX = 0;
		var totalY = 0;
		for (var origin in group.cursors) {
			for (var cursor in group.cursors[origin]) {
				var ongoing = nestedMapGet(this.ongoingMoves, origin, +cursor);
				if (!ongoing) continue;

				// it may seem a good idea to store the whole thing into startDelta,
				// but group.element may be changing so this has to be a bit more verbose
				totalX += ongoing.startX + ((ongoing.lastCursorX - ongoing.startCursorX) / weight | 0) - ongoing.piece.localLeft;
				totalY += ongoing.startY + ((ongoing.lastCursorY - ongoing.startCursorY) / weight | 0) - ongoing.piece.localTop;
				++numCursors;
			}
		}

		if (numCursors > 0) {
			group.position = this.clipGroupPosition(group, (totalX / numCursors) | 0, (totalY / numCursors) | 0);
			return true;
		} else {
			return false;
		}
	};

	Jigsaw.prototype.startMove = function(origin, cursor, index, globalX, globalY) {
		origin = origin.toString();
		cursor = +cursor;

		var piece = this.pieces[index];
		if (!piece) return false;

		var group = piece.group;

		// move to front in the both layer; when the move ends the group goes
		// back to the lower layer but it should be on top of other groups in it
		this.boardElement.removeChild(group.element);
		this.boardElement.appendChild(group.element);
		this.updateGroupWeightAndZIndex(group, true);
		group.element.setAttribute(DATA_JIGSAW_GROUP_MOVING, '');
		if (!origin) {
			group.element.setAttribute(DATA_JIGSAW_GROUP_LOCAL_MOVING, '');
		}

		var globalLeft = group.globalLeft + piece.localLeft;
		var globalTop = group.globalTop + piece.localTop;

		nestedMapAdd(this.ongoingMoves, origin, cursor, {
			piece: piece,
			startX: globalLeft,
			startY: globalTop,
			startCursorX: globalX,
			startCursorY: globalY,
			lastCursorX: globalX,
			lastCursorY: globalY
		});
		nestedMapAdd(group.cursors, origin, cursor, true);

		// new cursor reduces the "power" of other existing cursors
		this.updateGroupPositionFromExistingCursors(group);

		if (this.onStartMove && !origin) {
			this.onStartMove(cursor, piece, globalX, globalY);
		}

		return true;
	};

	Jigsaw.prototype.updateMove = function(origin, cursor, globalX, globalY) {
		origin = origin.toString();
		cursor = +cursor;

		var ongoing = nestedMapGet(this.ongoingMoves, origin, cursor);
		if (!ongoing) return false;
		ongoing.lastCursorX = globalX;
		ongoing.lastCursorY = globalY;

		var piece = ongoing.piece;
		var group = piece.group;

		// group.element may have been updated, so move it to front again
		this.updateGroupWeightAndZIndex(group, true);

		this.updateGroupPositionFromExistingCursors(group);

		if (this.onUpdateMove && !origin) {
			this.onUpdateMove(cursor, piece, globalX, globalY);
		}

		return true;
	};

	Jigsaw.prototype.endMove = function(origin, cursor, globalX, globalY) {
		origin = origin.toString();
		cursor = +cursor;

		var ongoing = nestedMapGet(this.ongoingMoves, origin, cursor);
		if (!ongoing) return false;

		var piece = ongoing.piece;
		var group = piece.group;

		nestedMapRemove(this.ongoingMoves, origin, cursor);
		nestedMapRemove(group.cursors, origin, cursor);

		this.updateGroupWeightAndZIndex(group, false);
		group.element.removeAttribute(DATA_JIGSAW_GROUP_MOVING);
		if (!origin) {
			group.element.removeAttribute(DATA_JIGSAW_GROUP_LOCAL_MOVING);
		}

		// endMove does also update the coordinates! this does two things:
		// 1. increase the "power" of remaining cursors back, and
		// 2. if no cursor is remaining, the last cursor finalizes the group position
		if (!this.updateGroupPositionFromExistingCursors(group)) {
			var weight = group.weight;
			group.position = this.clipGroupPosition(group,
				ongoing.startX + ((globalX - ongoing.startCursorX) / weight | 0) - ongoing.piece.localLeft,
				ongoing.startY + ((globalY - ongoing.startCursorY) / weight | 0) - ongoing.piece.localTop);
		}

		// only propagate local events to other events or callbacks
		if (!origin) {
			if (this.onEndMove) {
				this.onEndMove(cursor, piece, globalX, globalY);
			}

			// snapping occurs after the event is triggered
			this.checkSnap(piece.group.index);
		}

		return true;
	};

	Jigsaw.prototype.cancelMove = function(origin, cursor) {
		origin = origin.toString();
		cursor = +cursor;

		var ongoing = nestedMapGet(this.ongoingMoves, origin, cursor);
		if (!ongoing) return false;

		var piece = ongoing.piece;
		var group = piece.group;

		nestedMapRemove(this.ongoingMoves, origin, cursor);
		nestedMapRemove(group.cursors, origin, cursor);

		this.updateGroupWeightAndZIndex(group, false);
		group.element.removeAttribute(DATA_JIGSAW_GROUP_MOVING);
		if (!origin) {
			group.element.removeAttribute(DATA_JIGSAW_GROUP_LOCAL_MOVING);
		}

		// if the origin was local (an empty string), the next event handler will
		// try to call any of start/update/endMove which will fail due to the lack of
		// matching ongoing move. the handler will then uninstall itself as intended.

		if (this.onCancelMove && !origin) {
			this.onCancelMove(ongoing.piece);
		}

		return true;
	};

	Jigsaw.prototype.checkSnap = function(triggeredGroupIndex) {
		var triggeredGroupPiece = this.pieces[triggeredGroupIndex];
		if (!triggeredGroupPiece) return;

		// all pieces in the group are visited; if the neighbor is not in the same group,
		// that piece is examined and added to the merge list if it is close enough.
		// we may merge multiple groups at once, so the search must continue after that.
		var stack = [triggeredGroupPiece];
		var visitedPieces = {};
		var mergedGroupIndices = {};
		var snapThresholdSq = this.snapThreshold * this.snapThreshold;
		while (stack.length > 0) {
			var piece = stack.pop();
			if (visitedPieces[piece.index]) continue;
			visitedPieces[piece.index] = true;

			for (var side = 0; side < 4; ++side) {
				var sideIndex = piece.endIndices[side];
				if (sideIndex < 0) continue;
				var sidePiece = this.pieces[sideIndex];
				if (sidePiece.group.index === triggeredGroupIndex) {
					stack.push(sidePiece);
				} else if (!mergedGroupIndices[sidePiece.group.index]) {
					var pieceOffset = piece.getOffsetFrom(side, sidePiece);
					if (pieceOffset[0] * pieceOffset[0] + pieceOffset[1] * pieceOffset[1] <= snapThresholdSq) {
						mergedGroupIndices[sidePiece.group.index] = true;
					}
				}
			}
		}

		var groups = Object.keys(mergedGroupIndices).map(function(g) { return +g; });
		if (groups.length === 0) return; // no merger occurred

		// find the largest group to snap (may be customized with snapMode)
		var largestGroupIndex = -1;
		var largestGroupSize = 0;
		if (this.snapMode !== SNAP_TO_NOT_MOVED) {
			largestGroupIndex = triggeredGroupIndex;
			largestGroupSize = this.groups[triggeredGroupIndex].length;
		}
		if (this.snapMode !== SNAP_TO_MOVED) {
			groups.forEach(function(g) {
				var groupSize = this.groups[g].length;
				if (largestGroupSize < groupSize) {
					largestGroupSize = groupSize;
					largestGroupIndex = g;
				}
			}.bind(this));
		}

		groups.push(triggeredGroupIndex); // triggeredGroupIndex is no longer special
		this.mergeGroups(largestGroupIndex, groups);
		if (this.onSnap) {
			this.onSnap(largestGroupIndex, groups);
		}
	};

	Jigsaw.prototype.mergeGroups = function(mergedGroupIndex, otherGroupIndices) {
		var mergedGroup = this.groups[mergedGroupIndex];
		if (!mergedGroup) return false;

		// this delta value should be same for all pieces in mergedGroup; we use the known piece
		var anyPiece = this.pieces[mergedGroupIndex];
		var deltaX = anyPiece.localLeft - anyPiece.clipLeft;
		var deltaY = anyPiece.localTop - anyPiece.clipTop;

		// collect all pieces
		otherGroupIndices.forEach(function(g) {
			var group = this.groups[g]; // retain for the later adjustment
			if (!group) return;

			// no adjustment is required if this is the merged group
			if (g === mergedGroupIndex) return;
			delete this.groups[g];

			Array.prototype.push.apply(mergedGroup.pieceIndices, group.pieceIndices);
			for (var origin in group.cursors) {
				for (var cursor in group.cursors[origin]) {
					nestedMapAdd(mergedGroup.cursors, origin, cursor, group.cursors[origin][cursor]);
				}
			}

			// the group element is gone by now
			group.element.parentNode.removeChild(group.element);
		}.bind(this));

		// sort all pieces collected so that the shadow can be hidden
		mergedGroup.pieceIndices.sort(function(a, b) { return a - b; });

		// adjust any local piece coordinates as needed
		mergedGroup.pieceIndices.forEach(function(index) {
			var piece = this.pieces[index];
			piece.localPosition = [piece.clipLeft + deltaX, piece.clipTop + deltaY];
			piece.group.element.removeChild(piece.element);
			piece.group = mergedGroup;
			mergedGroup.element.appendChild(piece.element);
		}.bind(this));

		this.boardElement.removeChild(mergedGroup.element); // move to front
		this.boardElement.appendChild(mergedGroup.element);

		return true;
	};

	////////////////////////////////////////////////////////////////////////////////

	window.Jigsaw = Jigsaw;
})(window)

// vim: ts=4 sw=4 sts=4
