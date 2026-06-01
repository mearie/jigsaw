;(function(window) {
	"use strict";

	var TOP_SIDE = 0;
	var RIGHT_SIDE = 1;
	var BOTTOM_SIDE = 2;
	var LEFT_SIDE = 3;

	var SNAP_TO_ANY = 1;
	var SNAP_TO_MOVED = 2;
	var SNAP_TO_NOT_MOVED = 3;

	var DATA_JIGSAW = 'data-jigsaw';

	var STATE_GROUP = 9;

	var currentTime;
	if (window.performance && window.performance.now) {
		currentTime = function() { return window.performance.now(); };
	} else if (window.performance && window.performance.webkitNow) {
		currentTime = function() { return window.performance.webkitNow(); };
	} else {
		currentTime = function() { return +new Date(); };
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
		m = 0x04000000;
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
	// Cubic bezier sampling

	function sampleCubicBezier(x0, y0, cx1, cy1, cx2, cy2, x1, y1, numSamples) {
		var points = [];
		for (var i = 1; i <= numSamples; i++) {
			var t = i / numSamples;
			var mt = 1 - t;
			var mt2 = mt * mt;
			var mt3 = mt2 * mt;
			var t2 = t * t;
			var t3 = t2 * t;
			points.push([
				mt3 * x0 + 3 * mt2 * t * cx1 + 3 * mt * t2 * cx2 + t3 * x1,
				mt3 * y0 + 3 * mt2 * t * cy1 + 3 * mt * t2 * cy2 + t3 * y1
			]);
		}
		return points;
	}

	////////////////////////////////////////////////////////////////////////////////

	function JigsawEnd(seed, edgeSize, maxWidth, height, side) {
		this.seed = seed;
		this.edgeSize = edgeSize;
		this.maxWidth = maxWidth;
		this.height = height;
		this.side = side;
	}

	JigsawEnd.prototype.getPathCommands = function() {
		var vertical = this.side % 2 == 1;
		var sideSign = this.side > 1 ? -1 : +1;

		if (this.seed === 0) {
			if (vertical) {
				return [{type: 'line', dx: 0, dy: sideSign * this.edgeSize}];
			} else {
				return [{type: 'line', dx: sideSign * this.edgeSize, dy: 0}];
			}
		}

		var seedSign = this.seed < 0 ? -1 : +1;
		var h0h1 = hash(Math.abs(this.seed), 0x26282c6b, 0x3e279c7a);
		var h0 = h0h1[0], h1 = h0h1[1];
		function random(hv, shift, scale) {
			return (((hv >> shift) & 15) / 15 - 0.5) * scale;
		}

		var scaleX = this.maxWidth * sideSign * seedSign;
		var scaleY = -this.height * sideSign * seedSign;

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

		var cmds = [];
		var curves;
		if (seedSign > 0) {
			if (vertical) {
				cmds.push({type: 'line', dx: 0, dy: (this.edgeSize / 2 + hi1a * this.maxWidth) * sideSign});
			} else {
				cmds.push({type: 'line', dx: (this.edgeSize / 2 + hi1a * this.maxWidth) * sideSign, dy: 0});
			}
			curves = [
				[hi1a, 1, lo1a, 1, lo1b, half1a, mid1a, half1],
				[mid1a, half1, mid1b, half1b, hi1b, 0, 0, 0],
				[0, 0, -hi1b, 0, hi2a, half2a, mid2a, half2],
				[mid2a, half2, mid2b, half2b, lo2a, 1, hi2b, 1]
			];
			for (var ci = 0; ci < curves.length; ci++) {
				var c = curves[ci];
				if (vertical) {
					cmds.push({type: 'cubic',
						dx1: (c[0] - c[2]) * scaleY, dy1: (c[2] - c[0]) * (-scaleY) + (c[3] - c[1]) * scaleX,
						dx2: 0, dy2: 0, dx3: 0, dy3: 0
					});
				}
			}
			if (vertical) {
				cmds.push({type: 'line', dx: 0, dy: (this.edgeSize / 2 - hi2b * this.maxWidth) * sideSign});
			} else {
				cmds.push({type: 'line', dx: (this.edgeSize / 2 - hi2b * this.maxWidth) * sideSign, dy: 0});
			}
		}

		return cmds;
	};

	// trace path onto a Canvas 2D context, returns [endX, endY]
	JigsawEnd.prototype.traceOnCanvas = function(ctx, startX, startY) {
		var vertical = this.side % 2 == 1;
		var sideSign = this.side > 1 ? -1 : +1;

		if (this.seed === 0) {
			var ex = startX + (vertical ? 0 : sideSign * this.edgeSize);
			var ey = startY + (vertical ? sideSign * this.edgeSize : 0);
			ctx.lineTo(ex, ey);
			return [ex, ey];
		}

		var seedSign = this.seed < 0 ? -1 : +1;
		var h0h1 = hash(Math.abs(this.seed), 0x26282c6b, 0x3e279c7a);
		var h0 = h0h1[0], h1 = h0h1[1];
		function random(hv, shift, scale) {
			return (((hv >> shift) & 15) / 15 - 0.5) * scale;
		}

		var scaleX = this.maxWidth * sideSign * seedSign;
		var scaleY = -this.height * sideSign * seedSign;

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

		function curveAbs(x0, y0, ax0, ay0, ax1, ay1, ax2, ay2, ax3, ay3) {
			var cx1, cy1, cx2, cy2, ex, ey;
			if (vertical) {
				cx1 = x0 + (ay0 - ay1) * scaleY;
				cy1 = y0 + (ax1 - ax0) * scaleX;
				cx2 = x0 + (ay0 - ay2) * scaleY;
				cy2 = y0 + (ax2 - ax0) * scaleX;
				ex  = x0 + (ay0 - ay3) * scaleY;
				ey  = y0 + (ax3 - ax0) * scaleX;
			} else {
				cx1 = x0 + (ax1 - ax0) * scaleX;
				cy1 = y0 + (ay1 - ay0) * scaleY;
				cx2 = x0 + (ax2 - ax0) * scaleX;
				cy2 = y0 + (ay2 - ay0) * scaleY;
				ex  = x0 + (ax3 - ax0) * scaleX;
				ey  = y0 + (ay3 - ay0) * scaleY;
			}
			ctx.bezierCurveTo(cx1, cy1, cx2, cy2, ex, ey);
			return [ex, ey];
		}

		var x = startX, y = startY;

		var curveData, lineEnd;
		if (seedSign > 0) {
			if (vertical) {
				y += (this.edgeSize / 2 + hi1a * this.maxWidth) * sideSign;
			} else {
				x += (this.edgeSize / 2 + hi1a * this.maxWidth) * sideSign;
			}
			ctx.lineTo(x, y);

			var p;
			p = curveAbs(x, y, hi1a, 1, lo1a, 1, lo1b, half1a, mid1a, half1); x = p[0]; y = p[1];
			p = curveAbs(x, y, mid1a, half1, mid1b, half1b, hi1b, 0, 0, 0); x = p[0]; y = p[1];
			p = curveAbs(x, y, 0, 0, -hi1b, 0, hi2a, half2a, mid2a, half2); x = p[0]; y = p[1];
			p = curveAbs(x, y, mid2a, half2, mid2b, half2b, lo2a, 1, hi2b, 1); x = p[0]; y = p[1];

			if (vertical) {
				y += (this.edgeSize / 2 - hi2b * this.maxWidth) * sideSign;
			} else {
				x += (this.edgeSize / 2 - hi2b * this.maxWidth) * sideSign;
			}
			ctx.lineTo(x, y);
		} else {
			if (vertical) {
				y += (this.edgeSize / 2 - hi2b * this.maxWidth) * sideSign;
			} else {
				x += (this.edgeSize / 2 - hi2b * this.maxWidth) * sideSign;
			}
			ctx.lineTo(x, y);

			var p;
			p = curveAbs(x, y, hi2b, 1, lo2a, 1, mid2b, half2b, mid2a, half2); x = p[0]; y = p[1];
			p = curveAbs(x, y, mid2a, half2, hi2a, half2a, -hi1b, 0, 0, 0); x = p[0]; y = p[1];
			p = curveAbs(x, y, 0, 0, hi1b, 0, mid1b, half1b, mid1a, half1); x = p[0]; y = p[1];
			p = curveAbs(x, y, mid1a, half1, lo1b, half1a, lo1a, 1, hi1a, 1); x = p[0]; y = p[1];

			if (vertical) {
				y += (this.edgeSize / 2 + hi1a * this.maxWidth) * sideSign;
			} else {
				x += (this.edgeSize / 2 + hi1a * this.maxWidth) * sideSign;
			}
			ctx.lineTo(x, y);
		}

		return [x, y];
	};

	// sample outline points for hit testing and WebGL outline rendering
	JigsawEnd.prototype.getOutlinePoints = function(startX, startY, samplesPerCurve) {
		samplesPerCurve = samplesPerCurve || 8;
		var vertical = this.side % 2 == 1;
		var sideSign = this.side > 1 ? -1 : +1;

		if (this.seed === 0) {
			var ex = startX + (vertical ? 0 : sideSign * this.edgeSize);
			var ey = startY + (vertical ? sideSign * this.edgeSize : 0);
			return [[ex, ey]];
		}

		var seedSign = this.seed < 0 ? -1 : +1;
		var h0h1 = hash(Math.abs(this.seed), 0x26282c6b, 0x3e279c7a);
		var h0 = h0h1[0], h1 = h0h1[1];
		function random(hv, shift, scale) {
			return (((hv >> shift) & 15) / 15 - 0.5) * scale;
		}

		var scaleX = this.maxWidth * sideSign * seedSign;
		var scaleY = -this.height * sideSign * seedSign;

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

		var points = [];
		var x = startX, y = startY;

		function computeCurve(ax0, ay0, ax1, ay1, ax2, ay2, ax3, ay3) {
			var cx1, cy1, cx2, cy2, ex, ey;
			if (vertical) {
				cx1 = x + (ay0 - ay1) * scaleY; cy1 = y + (ax1 - ax0) * scaleX;
				cx2 = x + (ay0 - ay2) * scaleY; cy2 = y + (ax2 - ax0) * scaleX;
				ex  = x + (ay0 - ay3) * scaleY; ey  = y + (ax3 - ax0) * scaleX;
			} else {
				cx1 = x + (ax1 - ax0) * scaleX; cy1 = y + (ay1 - ay0) * scaleY;
				cx2 = x + (ax2 - ax0) * scaleX; cy2 = y + (ay2 - ay0) * scaleY;
				ex  = x + (ax3 - ax0) * scaleX; ey  = y + (ay3 - ay0) * scaleY;
			}
			var pts = sampleCubicBezier(x, y, cx1, cy1, cx2, cy2, ex, ey, samplesPerCurve);
			for (var i = 0; i < pts.length; i++) points.push(pts[i]);
			x = ex; y = ey;
		}

		if (seedSign > 0) {
			if (vertical) { y += (this.edgeSize / 2 + hi1a * this.maxWidth) * sideSign; }
			else { x += (this.edgeSize / 2 + hi1a * this.maxWidth) * sideSign; }
			points.push([x, y]);

			computeCurve(hi1a, 1, lo1a, 1, lo1b, half1a, mid1a, half1);
			computeCurve(mid1a, half1, mid1b, half1b, hi1b, 0, 0, 0);
			computeCurve(0, 0, -hi1b, 0, hi2a, half2a, mid2a, half2);
			computeCurve(mid2a, half2, mid2b, half2b, lo2a, 1, hi2b, 1);

			if (vertical) { y += (this.edgeSize / 2 - hi2b * this.maxWidth) * sideSign; }
			else { x += (this.edgeSize / 2 - hi2b * this.maxWidth) * sideSign; }
			points.push([x, y]);
		} else {
			if (vertical) { y += (this.edgeSize / 2 - hi2b * this.maxWidth) * sideSign; }
			else { x += (this.edgeSize / 2 - hi2b * this.maxWidth) * sideSign; }
			points.push([x, y]);

			computeCurve(hi2b, 1, lo2a, 1, mid2b, half2b, mid2a, half2);
			computeCurve(mid2a, half2, hi2a, half2a, -hi1b, 0, 0, 0);
			computeCurve(0, 0, hi1b, 0, mid1b, half1b, mid1a, half1);
			computeCurve(mid1a, half1, lo1b, half1a, lo1a, 1, hi1a, 1);

			if (vertical) { y += (this.edgeSize / 2 + hi1a * this.maxWidth) * sideSign; }
			else { x += (this.edgeSize / 2 + hi1a * this.maxWidth) * sideSign; }
			points.push([x, y]);
		}

		return points;
	};

	////////////////////////////////////////////////////////////////////////////////
	// WebGL utilities

	function compileShader(gl, type, source) {
		var shader = gl.createShader(type);
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			console.error('Shader compile error:', gl.getShaderInfoLog(shader));
			gl.deleteShader(shader);
			return null;
		}
		return shader;
	}

	function createProgram(gl, vsSrc, fsSrc) {
		var vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
		var fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
		if (!vs || !fs) return null;
		var prog = gl.createProgram();
		gl.attachShader(prog, vs);
		gl.attachShader(prog, fs);
		gl.linkProgram(prog);
		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
			console.error('Program link error:', gl.getProgramInfoLog(prog));
			gl.deleteProgram(prog);
			return null;
		}
		gl.deleteShader(vs);
		gl.deleteShader(fs);
		return prog;
	}

	// point-in-polygon using ray casting
	function pointInPolygon(px, py, polygon) {
		var inside = false;
		for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
			var xi = polygon[i][0], yi = polygon[i][1];
			var xj = polygon[j][0], yj = polygon[j][1];
			if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
				inside = !inside;
			}
		}
		return inside;
	}

	////////////////////////////////////////////////////////////////////////////////

	function JigsawPiece(index, group, imagePath, imageWidth, imageHeight, clipLeft, clipTop, clipWidth, clipHeight, endWidth, endHeight, endSeeds, endIndices) {
		var ends = endSeeds.map(function(seed, side) {
			return new JigsawEnd(seed, side % 2 == 0 ? clipWidth : clipHeight, endWidth, endHeight, side);
		});

		var pieceWidth = clipWidth + endHeight * 2;
		var pieceHeight = clipHeight + endHeight * 2;

		// build outline points for hit testing and rendering
		var outlinePoints = [];
		var ox = endHeight, oy = endHeight;
		outlinePoints.push([ox, oy]);
		for (var side = 0; side < 4; side++) {
			var pts = ends[side].getOutlinePoints(ox, oy, 8);
			for (var pi = 0; pi < pts.length; pi++) outlinePoints.push(pts[pi]);
			var last = pts[pts.length - 1];
			ox = last[0]; oy = last[1];
		}

		this.index = index;
		this.group = group;
		this.localLeft = endHeight;
		this.localTop = endHeight;
		this.clipLeft = clipLeft;
		this.clipTop = clipTop;
		this.clipWidth = clipWidth;
		this.clipHeight = clipHeight;
		this.pieceWidth = pieceWidth;
		this.pieceHeight = pieceHeight;
		this.ends = ends;
		this.endIndices = endIndices;
		this.outlinePoints = outlinePoints;
		this.maskTexture = null;
	}

	Object.defineProperty(JigsawPiece.prototype, 'position', {
		get: function() {
			var groupPos = this.group.position;
			return [this.localLeft + groupPos[0], this.localTop + groupPos[1]];
		},
		set: function(pos) {
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
		this.index = index;
		this.weight = 0;
		this.globalLeft = 0;
		this.globalTop = 0;
		this.pieceIndices = pieceIndices;
		this.cursors = {};
		this.moving = false;
		this.localMoving = false;
	}

	Object.defineProperty(JigsawGroup.prototype, 'length', {
		get: function() { return this.pieceIndices.length; }
	});

	Object.defineProperty(JigsawGroup.prototype, 'position', {
		get: function() {
			return [this.globalLeft, this.globalTop];
		},
		set: function(pos) {
			this.globalLeft = pos[0];
			this.globalTop = pos[1];
		}
	});

	////////////////////////////////////////////////////////////////////////////////
	// Shader sources

	var FULLSCREEN_VS = 'attribute vec2 aPosition;void main(){gl_Position=vec4(aPosition,0.0,1.0);}';

	var BG_FS = [
		'precision mediump float;',
		'uniform vec2 uVP;uniform float uDPR;uniform vec2 uBO;uniform float uIZ;',
		'uniform float uGI;uniform vec2 uBS;uniform float uDone;',
		'void main(){',
		'if(uDone>0.5)discard;',
		'vec2 s=gl_FragCoord.xy/uDPR;s.y=uVP.y-s.y;',
		'vec2 w=(s-uVP*0.5)*uIZ-uBO;',
		'vec2 g=abs(fract(w/uGI+0.5)-0.5)*uGI;',
		'float pw=uIZ;float gd=min(g.x,g.y);float l=1.0-smoothstep(0.0,pw,gd);',
		'float d=length(w)/min(uBS.x,uBS.y);',
		'float a=mix(0.125,1.0,clamp(d,0.0,1.0));',
		'gl_FragColor=vec4(0.25,0.25,0.25,a*l);}'
	].join('\n');

	var BOUND_FS = [
		'precision mediump float;',
		'uniform vec2 uVP;uniform float uDPR;uniform vec2 uBO;uniform float uIZ;',
		'uniform vec2 uBS;uniform float uDone;',
		'void main(){',
		'if(uDone>0.5)discard;',
		'vec2 s=gl_FragCoord.xy/uDPR;s.y=uVP.y-s.y;',
		'vec2 w=(s-uVP*0.5)*uIZ-uBO;',
		'if(w.x>=-uBS.x&&w.x<=uBS.x&&w.y>=-uBS.y&&w.y<=uBS.y)discard;',
		'gl_FragColor=vec4(1.0,0.0,0.0,0.2);}'
	].join('\n');

	// Batched piece vertex shader: per-vertex attributes for piece data
	var BATCH_VS = [
		'attribute vec2 aQP;',       // quad corner 0..1
		'attribute vec2 aOff;',      // world offset
		'attribute vec2 aPS;',       // piece size
		'attribute vec2 aCO;',       // clip offset for image UV
		'attribute vec2 aMUVB;',     // mask atlas UV base
		'attribute vec2 aMUVS;',     // mask atlas UV size
		'uniform vec2 uVP;uniform vec2 uBO;uniform float uIZ;uniform vec2 uIS;uniform vec2 uSO;',
		'varying vec2 vMUV;varying vec2 vIUV;',
		'void main(){',
		'vec2 lp=aQP*aPS;vec2 wp=lp+aOff+uSO;',
		'vec2 sc=(wp+uBO)/uIZ+uVP*0.5;',
		'vec2 cl=sc/uVP*2.0-1.0;cl.y=-cl.y;',
		'gl_Position=vec4(cl,0.0,1.0);',
		'vMUV=aMUVB+aQP*aMUVS;',
		'vIUV=(lp+aCO)/uIS;}'
	].join('\n');

	var BATCH_PIECE_FS = [
		'precision mediump float;',
		'varying vec2 vMUV;varying vec2 vIUV;',
		'uniform sampler2D uMask;uniform sampler2D uImg;uniform float uImgOK;',
		'void main(){',
		'float m=texture2D(uMask,vMUV).a;if(m<0.01)discard;',
		'vec4 c=uImgOK>0.5?texture2D(uImg,vIUV):vec4(0.75,0.75,0.75,1.0);',
		'gl_FragColor=vec4(c.rgb,m);}'
	].join('\n');

	var BATCH_SHADOW_FS = [
		'precision mediump float;',
		'varying vec2 vMUV;',
		'uniform sampler2D uMask;uniform float uSA;',
		'void main(){',
		'float m=texture2D(uMask,vMUV).a;if(m<0.01)discard;',
		'gl_FragColor=vec4(0.0,0.0,0.0,m*uSA);}'
	].join('\n');

	// Batched pick: pick color as vertex attribute
	var BATCH_PICK_VS = [
		'attribute vec2 aQP;attribute vec2 aOff;attribute vec2 aPS;',
		'attribute vec2 aMUVB;attribute vec2 aMUVS;attribute vec3 aPC;',
		'uniform vec2 uVP;uniform vec2 uBO;uniform float uIZ;',
		'varying vec2 vMUV;varying vec3 vPC;',
		'void main(){',
		'vec2 lp=aQP*aPS;vec2 wp=lp+aOff;',
		'vec2 sc=(wp+uBO)/uIZ+uVP*0.5;',
		'vec2 cl=sc/uVP*2.0-1.0;cl.y=-cl.y;',
		'gl_Position=vec4(cl,0.0,1.0);',
		'vMUV=aMUVB+aQP*aMUVS;vPC=aPC;}'
	].join('\n');

	var BATCH_PICK_FS = [
		'precision mediump float;',
		'varying vec2 vMUV;varying vec3 vPC;',
		'uniform sampler2D uMask;',
		'void main(){',
		'float m=texture2D(uMask,vMUV).a;if(m<0.5)discard;',
		'gl_FragColor=vec4(vPC,1.0);}'
	].join('\n');

	var OUTLINE_VS = [
		'attribute vec2 aPos;attribute float aAlpha;',
		'uniform vec2 uVP;uniform vec2 uBO;uniform float uIZ;',
		'varying float vAlpha;',
		'void main(){',
		'vec2 sc=(aPos+uBO)/uIZ+uVP*0.5;',
		'vec2 cl=sc/uVP*2.0-1.0;cl.y=-cl.y;',
		'gl_Position=vec4(cl,0.0,1.0);vAlpha=aAlpha;}'
	].join('\n');

	var OUTLINE_FS = [
		'precision mediump float;varying float vAlpha;',
		'void main(){gl_FragColor=vec4(0.0,0.0,0.0,vAlpha);}'
	].join('\n');

	var GLOW_FS = [
		'precision mediump float;',
		'varying vec2 vMUV;',
		'uniform sampler2D uMask;uniform vec2 uMTS;uniform float uGR;',
		'void main(){',
		'float a=0.0;float n=0.0;',
		'for(float dx=-3.0;dx<=3.0;dx+=1.0)',
		'for(float dy=-3.0;dy<=3.0;dy+=1.0){',
		'a+=texture2D(uMask,vMUV+vec2(dx,dy)*uMTS*uGR).a;n+=1.0;}',
		'float g=a/n;if(g<0.01)discard;',
		'gl_FragColor=vec4(1.0,0.843,0.0,g*0.6);}'
	].join('\n');

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

		this.touchGestureLatency = options.touchGestureLatency || 0.1;
		this.gridInterval = options.gridInterval || 100;
		this.snapMode = {
			'any': SNAP_TO_ANY, 'moved': SNAP_TO_MOVED, 'not-moved': SNAP_TO_NOT_MOVED
		}[options.snapMode] || SNAP_TO_NOT_MOVED;
		this.snapThreshold = options.snapThreshold || 0.25;
		this.weightFunc = options.weightFunc;
		this.autoScrollBorderSizeOnEdge = options.autoScrollBorderSizeOnEdge || 30;
		this.autoScrollAmountFunc = options.autoScrollAmountFunc;
		this.maxInvZoom = options.maxInvZoom || 4;
		this.wheelZoomIncrement = options.wheelZoomIncrement || 0.05;
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

	Jigsaw.prototype.hash = hash;
	Jigsaw.prototype.now = currentTime;

	Jigsaw.prototype.deriveEndSeeds = function() {
		var seed = this.seed;
		var index = 0;
		var last = -1;
		var seen = {};
		var nextHash = function() {
			var h;
			do {
				if (last >= 0) {
					h = last;
					last = -1;
				} else {
					var hh = this.hash(index++, 0x3eecf395, seed);
					h = hh[0] | 0;
					last = hh[1] | 0;
				}
			} while (h !== 0 && seen[Math.abs(h)]);
			seen[Math.abs(h)] = true;
			return h;
		}.bind(this);

		this.horizontalSeeds = [];
		this.verticalSeeds = [];
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

	function getLocations(gl, prog, uniforms, attribs) {
		var loc = {};
		for (var i = 0; i < uniforms.length; i++)
			loc[uniforms[i]] = gl.getUniformLocation(prog, uniforms[i]);
		for (var i = 0; i < attribs.length; i++)
			loc[attribs[i]] = gl.getAttribLocation(prog, attribs[i]);
		return loc;
	}

	// 6 vertices per quad (2 triangles), returns flat vertex count
	var QUAD_IDX = [[0,0],[1,0],[0,1],[1,0],[1,1],[0,1]];
	var VERTS_PER_PIECE = 6;

	Jigsaw.prototype.initWebGL = function() {
		this.canvas = document.createElement('canvas');
		this.canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
		this.parent.appendChild(this.canvas);
		this.parent.setAttribute(DATA_JIGSAW, '');

		var gl = this.canvas.getContext('webgl', {alpha:true,premultipliedAlpha:true,stencil:false,antialias:false})
			|| this.canvas.getContext('experimental-webgl', {alpha:true,premultipliedAlpha:true});
		this.gl = gl;

		// programs
		this.bgProg = createProgram(gl, FULLSCREEN_VS, BG_FS);
		this.boundProg = createProgram(gl, FULLSCREEN_VS, BOUND_FS);
		this.pieceProg = createProgram(gl, BATCH_VS, BATCH_PIECE_FS);
		this.shadowProg = createProgram(gl, BATCH_VS, BATCH_SHADOW_FS);
		this.pickProg = createProgram(gl, BATCH_PICK_VS, BATCH_PICK_FS);
		this.outlineProg = createProgram(gl, OUTLINE_VS, OUTLINE_FS);
		this.glowProg = createProgram(gl, BATCH_VS, GLOW_FS);

		// cache locations
		this.bgLoc = getLocations(gl, this.bgProg, ['uVP','uDPR','uBO','uIZ','uGI','uBS','uDone'], ['aPosition']);
		this.boundLoc = getLocations(gl, this.boundProg, ['uVP','uDPR','uBO','uIZ','uBS','uDone'], ['aPosition']);
		this.pieceLoc = getLocations(gl, this.pieceProg, ['uVP','uBO','uIZ','uIS','uSO','uMask','uImg','uImgOK'], ['aQP','aOff','aPS','aCO','aMUVB','aMUVS']);
		this.shadowLoc = getLocations(gl, this.shadowProg, ['uVP','uBO','uIZ','uIS','uSO','uMask','uSA'], ['aQP','aOff','aPS','aCO','aMUVB','aMUVS']);
		this.pickLoc = getLocations(gl, this.pickProg, ['uVP','uBO','uIZ','uMask'], ['aQP','aOff','aPS','aMUVB','aMUVS','aPC']);
		this.outlineLoc = getLocations(gl, this.outlineProg, ['uVP','uBO','uIZ'], ['aPos','aAlpha']);
		this.glowLoc = getLocations(gl, this.glowProg, ['uVP','uBO','uIZ','uIS','uSO','uMask','uMTS','uGR'], ['aQP','aOff','aPS','aCO','aMUVB','aMUVS']);

		// fullscreen quad
		this.quadBuf = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);

		// dynamic batch buffers
		this.batchBuf = gl.createBuffer();
		this.outlineBuf = gl.createBuffer();
		this.pickBuf = gl.createBuffer();

		// pick framebuffer
		this.pickFBO = gl.createFramebuffer();
		this.pickColorTex = gl.createTexture();
		this.pickFBOW = 0;
		this.pickFBOH = 0;

		// image texture
		this.imageTex = gl.createTexture();
		this.imageLoaded = false;

		// atlas textures (filled in _createMaskAtlas)
		this.maskAtlases = [];

		this._dirty = true;
		this._pickDirty = true;
		this._hoveredGroupIndex = -1;
		this._rafId = 0;

		// pre-allocated batch arrays (grown as needed)
		this._batchFloat = null;
		this._outlineFloat = null;
		this._pickFloat = null;

		this._resizeCanvas();
	};

	Jigsaw.prototype._resizeCanvas = function() {
		var rect = this.parent.getBoundingClientRect();
		var dpr = window.devicePixelRatio || 1;
		var w = Math.round(rect.width * dpr);
		var h = Math.round(rect.height * dpr);
		if (this.canvas.width !== w || this.canvas.height !== h) {
			this.canvas.width = w;
			this.canvas.height = h;
			this._dirty = true;
			this._pickDirty = true;
		}
	};

	Jigsaw.prototype._loadImageTexture = function() {
		var self = this;
		var img = new Image();
		img.onload = function() {
			if (!self.gl) return;
			var gl = self.gl;
			gl.bindTexture(gl.TEXTURE_2D, self.imageTex);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			self.imageLoaded = true;
			self._dirty = true;
		};
		img.src = this.imagePath;
	};

	Jigsaw.prototype._createMaskAtlas = function() {
		var gl = this.gl;
		var pieces = this.pieces;
		var maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
		var atlasSize = Math.min(4096, maxTexSize);

		// find max piece dimensions for uniform cell packing
		var cellW = 0, cellH = 0;
		for (var i = 0; i < pieces.length; i++) {
			if (pieces[i].pieceWidth > cellW) cellW = pieces[i].pieceWidth;
			if (pieces[i].pieceHeight > cellH) cellH = pieces[i].pieceHeight;
		}
		// add 1px padding to avoid bleeding
		cellW += 2; cellH += 2;

		var cols = Math.floor(atlasSize / cellW);
		var rows = Math.floor(atlasSize / cellH);
		var perAtlas = cols * rows;

		var numAtlases = Math.ceil(pieces.length / perAtlas);
		this.maskAtlases = [];
		this._atlasSize = atlasSize;
		this._atlasCellW = cellW;
		this._atlasCellH = cellH;
		this._atlasCols = cols;

		for (var ai = 0; ai < numAtlases; ai++) {
			var startIdx = ai * perAtlas;
			var endIdx = Math.min(startIdx + perAtlas, pieces.length);

			var offscreen = document.createElement('canvas');
			offscreen.width = atlasSize;
			offscreen.height = atlasSize;
			var ctx = offscreen.getContext('2d');
			ctx.clearRect(0, 0, atlasSize, atlasSize);
			ctx.fillStyle = 'white';

			for (var pi = startIdx; pi < endIdx; pi++) {
				var piece = pieces[pi];
				var localIdx = pi - startIdx;
				var col = localIdx % cols;
				var row = (localIdx / cols) | 0;
				var ox = col * cellW + 1;
				var oy = row * cellH + 1;

				ctx.beginPath();
				var endH = piece.ends[LEFT_SIDE].height;
				ctx.moveTo(ox + endH, oy + endH);
				var cx = ox + endH, cy = oy + endH;
				for (var side = 0; side < 4; side++) {
					var p = piece.ends[side].traceOnCanvas(ctx, cx, cy);
					cx = p[0]; cy = p[1];
				}
				ctx.closePath();
				ctx.fill();

				// store atlas UV for this piece
				piece.atlasIndex = ai;
				piece.maskUVBase = [
					(col * cellW + 1) / atlasSize,
					(row * cellH + 1) / atlasSize
				];
				piece.maskUVSize = [
					piece.pieceWidth / atlasSize,
					piece.pieceHeight / atlasSize
				];
			}

			var tex = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, tex);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, offscreen);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			this.maskAtlases.push(tex);
		}
	};

	Jigsaw.prototype._setupPickFBO = function() {
		var gl = this.gl;
		var w = this.canvas.width;
		var h = this.canvas.height;
		if (w === this.pickFBOW && h === this.pickFBOH) return;
		this.pickFBOW = w;
		this.pickFBOH = h;

		gl.bindTexture(gl.TEXTURE_2D, this.pickColorTex);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

		gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickFBO);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.pickColorTex, 0);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		this._pickDirty = true;
	};

	Jigsaw.prototype._startRenderLoop = function() {
		var self = this;
		function loop() {
			self._rafId = requestAnimationFrame(loop);
			self._resizeCanvas();
			if (self._dirty) {
				self._render();
				self._dirty = false;
			}
		}
		this._rafId = requestAnimationFrame(loop);
	};

	// compute visible world-space AABB for frustum culling
	Jigsaw.prototype._getVisibleBounds = function(cssW, cssH) {
		var halfW = cssW * 0.5 * this.boardInvZoom;
		var halfH = cssH * 0.5 * this.boardInvZoom;
		return {
			minX: -this.boardLeft - halfW,
			minY: -this.boardTop - halfH,
			maxX: -this.boardLeft + halfW,
			maxY: -this.boardTop + halfH
		};
	};

	Jigsaw.prototype._render = function() {
		var gl = this.gl;
		var pw = this.canvas.width;
		var ph = this.canvas.height;
		var dpr = window.devicePixelRatio || 1;
		var cssW = pw / dpr;
		var cssH = ph / dpr;

		gl.viewport(0, 0, pw, ph);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		var completed = this.parent.classList.contains('completed') ? 1.0 : 0.0;

		// background + boundary (2 draw calls)
		this._renderBG(gl, cssW, cssH, dpr, completed);

		// batched pieces
		this._renderAllBatched(gl, cssW, cssH, completed);

		this._pickDirty = true;
	};

	Jigsaw.prototype._renderBG = function(gl, w, h, dpr, done) {
		// background grid
		gl.useProgram(this.bgProg);
		var L = this.bgLoc;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
		gl.enableVertexAttribArray(L.aPosition);
		gl.vertexAttribPointer(L.aPosition, 2, gl.FLOAT, false, 0, 0);
		gl.uniform2f(L.uVP, w, h);
		gl.uniform1f(L.uDPR, dpr);
		gl.uniform2f(L.uBO, this.boardLeft, this.boardTop);
		gl.uniform1f(L.uIZ, this.boardInvZoom);
		gl.uniform1f(L.uGI, this.gridInterval);
		gl.uniform2f(L.uBS, this.boardWidth, this.boardHeight);
		gl.uniform1f(L.uDone, done);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

		// boundary
		gl.useProgram(this.boundProg);
		L = this.boundLoc;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
		gl.enableVertexAttribArray(L.aPosition);
		gl.vertexAttribPointer(L.aPosition, 2, gl.FLOAT, false, 0, 0);
		gl.uniform2f(L.uVP, w, h);
		gl.uniform1f(L.uDPR, dpr);
		gl.uniform2f(L.uBO, this.boardLeft, this.boardTop);
		gl.uniform1f(L.uIZ, this.boardInvZoom);
		gl.uniform2f(L.uBS, this.boardWidth, this.boardHeight);
		gl.uniform1f(L.uDone, done);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	};

	Jigsaw.prototype._renderAllBatched = function(gl, cssW, cssH, completed) {
		if (!this.pieces || !this.groupOrder) return;

		var bounds = this._getVisibleBounds(cssW, cssH);
		var numPieces = this.pieces.length;

		// build batch data: 12 floats per vertex, 6 verts per piece
		// [qpX, qpY, offX, offY, psW, psH, coX, coY, muvbX, muvbY, muvsX, muvsY]
		var FLOATS_PER_VERT = 12;
		var FLOATS_PER_PIECE = FLOATS_PER_VERT * VERTS_PER_PIECE;
		var maxFloats = numPieces * FLOATS_PER_PIECE;
		if (!this._batchFloat || this._batchFloat.length < maxFloats) {
			this._batchFloat = new Float32Array(maxFloats);
		}
		var bf = this._batchFloat;

		// also build outline data: 3 floats per vert (x, y, alpha), 2 verts per edge
		var maxOutlineVerts = 0;
		for (var i = 0; i < numPieces; i++) maxOutlineVerts += this.pieces[i].outlinePoints.length * 2;
		var OUTLINE_FPV = 3;
		if (!this._outlineFloat || this._outlineFloat.length < maxOutlineVerts * OUTLINE_FPV) {
			this._outlineFloat = new Float32Array(maxOutlineVerts * OUTLINE_FPV);
		}
		var of = this._outlineFloat;

		// group pieces by atlas, filling batch buffer in z-order
		var atlasRanges = []; // [{atlasIdx, start, count}]
		var batchOffset = 0;
		var outlineOffset = 0;
		var outlineCount = 0;
		var currentAtlas = -1;

		var hovGI = this._hoveredGroupIndex;
		var shadowAlphas = {}; // groupIndex -> alpha

		for (var gi = 0; gi < this.groupOrder.length; gi++) {
			var groupIndex = this.groupOrder[gi];
			var group = this.groups[groupIndex];
			if (!group) continue;

			var isHighlit = group.moving || group.index === hovGI;
			var oAlpha = isHighlit ? 0.8 : 0.2;
			shadowAlphas[groupIndex] = isHighlit ? 0.6 : 0.2;

			for (var pi = 0; pi < group.pieceIndices.length; pi++) {
				var piece = this.pieces[group.pieceIndices[pi]];
				if (!piece) continue;

				var endH = piece.ends[LEFT_SIDE].height;
				var wx = group.globalLeft + piece.localLeft - endH;
				var wy = group.globalTop + piece.localTop - endH;

				// frustum culling
				if (wx + piece.pieceWidth < bounds.minX || wx > bounds.maxX ||
				    wy + piece.pieceHeight < bounds.minY || wy > bounds.maxY) continue;

				// check atlas boundary
				var ai = piece.atlasIndex;
				if (ai !== currentAtlas) {
					if (currentAtlas >= 0 && batchOffset > (atlasRanges.length > 0 ? atlasRanges[atlasRanges.length-1].start + atlasRanges[atlasRanges.length-1].count : 0)) {
						// close current range
					}
					var startPc = batchOffset / FLOATS_PER_PIECE;
					atlasRanges.push({atlas: ai, start: startPc, count: 0});
					currentAtlas = ai;
				}

				// fill 6 vertices
				var mub = piece.maskUVBase, mus = piece.maskUVSize;
				var co0 = piece.clipLeft - endH, co1 = piece.clipTop - endH;
				for (var vi = 0; vi < VERTS_PER_PIECE; vi++) {
					var qi = QUAD_IDX[vi];
					var off = batchOffset + vi * FLOATS_PER_VERT;
					bf[off]    = qi[0]; bf[off+1]  = qi[1];
					bf[off+2]  = wx;    bf[off+3]  = wy;
					bf[off+4]  = piece.pieceWidth; bf[off+5] = piece.pieceHeight;
					bf[off+6]  = co0;   bf[off+7]  = co1;
					bf[off+8]  = mub[0]; bf[off+9] = mub[1];
					bf[off+10] = mus[0]; bf[off+11]= mus[1];
				}
				batchOffset += FLOATS_PER_PIECE;
				atlasRanges[atlasRanges.length-1].count++;

				// outline: LINE pairs
				var pts = piece.outlinePoints;
				for (var oi = 0; oi < pts.length; oi++) {
					var ni = (oi + 1) % pts.length;
					var ob = outlineOffset;
					of[ob]   = pts[oi][0] + wx; of[ob+1] = pts[oi][1] + wy; of[ob+2] = oAlpha;
					of[ob+3] = pts[ni][0] + wx; of[ob+4] = pts[ni][1] + wy; of[ob+5] = oAlpha;
					outlineOffset += 6;
					outlineCount += 2;
				}
			}
		}

		var totalPieces = batchOffset / FLOATS_PER_PIECE;
		if (totalPieces === 0) return;

		// upload batch buffer once
		gl.bindBuffer(gl.ARRAY_BUFFER, this.batchBuf);
		gl.bufferData(gl.ARRAY_BUFFER, bf.subarray(0, batchOffset), gl.DYNAMIC_DRAW);

		var stride = FLOATS_PER_VERT * 4;

		// helper to set batch vertex attribs
		var self = this;
		function setBatchAttribs(loc) {
			gl.bindBuffer(gl.ARRAY_BUFFER, self.batchBuf);
			gl.enableVertexAttribArray(loc.aQP);
			gl.vertexAttribPointer(loc.aQP, 2, gl.FLOAT, false, stride, 0);
			gl.enableVertexAttribArray(loc.aOff);
			gl.vertexAttribPointer(loc.aOff, 2, gl.FLOAT, false, stride, 8);
			gl.enableVertexAttribArray(loc.aPS);
			gl.vertexAttribPointer(loc.aPS, 2, gl.FLOAT, false, stride, 16);
			if (loc.aCO !== undefined && loc.aCO >= 0) {
				gl.enableVertexAttribArray(loc.aCO);
				gl.vertexAttribPointer(loc.aCO, 2, gl.FLOAT, false, stride, 24);
			}
			gl.enableVertexAttribArray(loc.aMUVB);
			gl.vertexAttribPointer(loc.aMUVB, 2, gl.FLOAT, false, stride, 32);
			gl.enableVertexAttribArray(loc.aMUVS);
			gl.vertexAttribPointer(loc.aMUVS, 2, gl.FLOAT, false, stride, 40);
		}

		function disableBatchAttribs(loc) {
			gl.disableVertexAttribArray(loc.aQP);
			gl.disableVertexAttribArray(loc.aOff);
			gl.disableVertexAttribArray(loc.aPS);
			if (loc.aCO !== undefined && loc.aCO >= 0) gl.disableVertexAttribArray(loc.aCO);
			gl.disableVertexAttribArray(loc.aMUVB);
			gl.disableVertexAttribArray(loc.aMUVS);
		}

		var shadowOff = 3 * this.boardInvZoom;

		// glow pass (only when completed)
		if (completed > 0.5) {
			var glowTime = (this.now() % 2000) / 2000;
			var glowRadius = 15 + 10 * (0.5 + 0.5 * Math.cos(glowTime * Math.PI * 2));
			var GL = this.glowLoc;
			gl.useProgram(this.glowProg);
			setBatchAttribs(GL);
			gl.uniform2f(GL.uVP, cssW, cssH);
			gl.uniform2f(GL.uBO, this.boardLeft, this.boardTop);
			gl.uniform1f(GL.uIZ, this.boardInvZoom);
			gl.uniform2f(GL.uIS, this.imageWidth, this.imageHeight);
			gl.uniform2f(GL.uSO, 0, 0);
			gl.uniform1f(GL.uGR, glowRadius / 3.0);
			gl.uniform2f(GL.uMTS, 1.0 / this._atlasSize, 1.0 / this._atlasSize);
			gl.uniform1i(GL.uMask, 0);
			for (var ri = 0; ri < atlasRanges.length; ri++) {
				var r = atlasRanges[ri];
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, this.maskAtlases[r.atlas]);
				gl.drawArrays(gl.TRIANGLES, r.start * VERTS_PER_PIECE, r.count * VERTS_PER_PIECE);
			}
			disableBatchAttribs(GL);
			this._dirty = true; // keep animating
		}

		// shadow pass (one draw per atlas)
		var SL = this.shadowLoc;
		gl.useProgram(this.shadowProg);
		setBatchAttribs(SL);
		gl.uniform2f(SL.uVP, cssW, cssH);
		gl.uniform2f(SL.uBO, this.boardLeft, this.boardTop);
		gl.uniform1f(SL.uIZ, this.boardInvZoom);
		gl.uniform2f(SL.uIS, this.imageWidth, this.imageHeight);
		gl.uniform2f(SL.uSO, shadowOff, shadowOff);
		gl.uniform1f(SL.uSA, 0.2);
		gl.uniform1i(SL.uMask, 0);
		for (var ri = 0; ri < atlasRanges.length; ri++) {
			var r = atlasRanges[ri];
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, this.maskAtlases[r.atlas]);
			gl.drawArrays(gl.TRIANGLES, r.start * VERTS_PER_PIECE, r.count * VERTS_PER_PIECE);
		}
		disableBatchAttribs(SL);

		// piece pass (one draw per atlas)
		var PL = this.pieceLoc;
		gl.useProgram(this.pieceProg);
		setBatchAttribs(PL);
		gl.uniform2f(PL.uVP, cssW, cssH);
		gl.uniform2f(PL.uBO, this.boardLeft, this.boardTop);
		gl.uniform1f(PL.uIZ, this.boardInvZoom);
		gl.uniform2f(PL.uIS, this.imageWidth, this.imageHeight);
		gl.uniform2f(PL.uSO, 0, 0);
		gl.uniform1f(PL.uImgOK, this.imageLoaded ? 1.0 : 0.0);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.imageTex);
		gl.uniform1i(PL.uImg, 1);
		gl.uniform1i(PL.uMask, 0);
		for (var ri = 0; ri < atlasRanges.length; ri++) {
			var r = atlasRanges[ri];
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, this.maskAtlases[r.atlas]);
			gl.drawArrays(gl.TRIANGLES, r.start * VERTS_PER_PIECE, r.count * VERTS_PER_PIECE);
		}
		disableBatchAttribs(PL);

		// outline pass (single draw call)
		if (outlineCount > 0) {
			gl.bindBuffer(gl.ARRAY_BUFFER, this.outlineBuf);
			gl.bufferData(gl.ARRAY_BUFFER, of.subarray(0, outlineOffset), gl.DYNAMIC_DRAW);
			var OL = this.outlineLoc;
			gl.useProgram(this.outlineProg);
			gl.enableVertexAttribArray(OL.aPos);
			gl.vertexAttribPointer(OL.aPos, 2, gl.FLOAT, false, 12, 0);
			gl.enableVertexAttribArray(OL.aAlpha);
			gl.vertexAttribPointer(OL.aAlpha, 1, gl.FLOAT, false, 12, 8);
			gl.uniform2f(OL.uVP, cssW, cssH);
			gl.uniform2f(OL.uBO, this.boardLeft, this.boardTop);
			gl.uniform1f(OL.uIZ, this.boardInvZoom);
			gl.drawArrays(gl.LINES, 0, outlineCount);
			gl.disableVertexAttribArray(OL.aPos);
			gl.disableVertexAttribArray(OL.aAlpha);
		}
	};

	Jigsaw.prototype._renderPickBuffer = function() {
		var gl = this.gl;
		if (!this._pickDirty) return;
		this._setupPickFBO();

		var pw = this.canvas.width, ph = this.canvas.height;
		var dpr = window.devicePixelRatio || 1;
		var cssW = pw / dpr, cssH = ph / dpr;
		var bounds = this._getVisibleBounds(cssW, cssH);

		// build pick buffer: 13 floats per vert (batch 12 + pickColor 3, but we use separate layout)
		// pick vertex: qpX, qpY, offX, offY, psW, psH, muvbX, muvbY, muvsX, muvsY, pcR, pcG, pcB
		var PICK_FPV = 13;
		var numPieces = this.pieces.length;
		var maxPickFloats = numPieces * VERTS_PER_PIECE * PICK_FPV;
		if (!this._pickFloat || this._pickFloat.length < maxPickFloats) {
			this._pickFloat = new Float32Array(maxPickFloats);
		}
		var pf = this._pickFloat;
		var pickOffset = 0;
		var pickAtlasRanges = [];
		var currentAtlas = -1;

		for (var gi = 0; gi < this.groupOrder.length; gi++) {
			var groupIndex = this.groupOrder[gi];
			var group = this.groups[groupIndex];
			if (!group) continue;
			for (var pi = 0; pi < group.pieceIndices.length; pi++) {
				var piece = this.pieces[group.pieceIndices[pi]];
				if (!piece) continue;
				var endH = piece.ends[LEFT_SIDE].height;
				var wx = group.globalLeft + piece.localLeft - endH;
				var wy = group.globalTop + piece.localTop - endH;
				if (wx + piece.pieceWidth < bounds.minX || wx > bounds.maxX ||
				    wy + piece.pieceHeight < bounds.minY || wy > bounds.maxY) continue;

				var ai = piece.atlasIndex;
				if (ai !== currentAtlas) {
					pickAtlasRanges.push({atlas: ai, start: pickOffset / (VERTS_PER_PIECE * PICK_FPV), count: 0});
					currentAtlas = ai;
				}

				var idx = piece.index + 1;
				var pcR = (idx & 0xFF) / 255.0;
				var pcG = ((idx >> 8) & 0xFF) / 255.0;
				var pcB = ((idx >> 16) & 0xFF) / 255.0;
				var mub = piece.maskUVBase, mus = piece.maskUVSize;

				for (var vi = 0; vi < VERTS_PER_PIECE; vi++) {
					var qi = QUAD_IDX[vi];
					var off = pickOffset + vi * PICK_FPV;
					pf[off]=qi[0]; pf[off+1]=qi[1];
					pf[off+2]=wx; pf[off+3]=wy;
					pf[off+4]=piece.pieceWidth; pf[off+5]=piece.pieceHeight;
					pf[off+6]=mub[0]; pf[off+7]=mub[1];
					pf[off+8]=mus[0]; pf[off+9]=mus[1];
					pf[off+10]=pcR; pf[off+11]=pcG; pf[off+12]=pcB;
				}
				pickOffset += VERTS_PER_PIECE * PICK_FPV;
				pickAtlasRanges[pickAtlasRanges.length-1].count++;
			}
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickFBO);
		gl.viewport(0, 0, pw, ph);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.disable(gl.BLEND);

		if (pickOffset > 0) {
			gl.bindBuffer(gl.ARRAY_BUFFER, this.pickBuf);
			gl.bufferData(gl.ARRAY_BUFFER, pf.subarray(0, pickOffset), gl.DYNAMIC_DRAW);

			var KL = this.pickLoc;
			var stride = PICK_FPV * 4;
			gl.useProgram(this.pickProg);
			gl.enableVertexAttribArray(KL.aQP);
			gl.vertexAttribPointer(KL.aQP, 2, gl.FLOAT, false, stride, 0);
			gl.enableVertexAttribArray(KL.aOff);
			gl.vertexAttribPointer(KL.aOff, 2, gl.FLOAT, false, stride, 8);
			gl.enableVertexAttribArray(KL.aPS);
			gl.vertexAttribPointer(KL.aPS, 2, gl.FLOAT, false, stride, 16);
			gl.enableVertexAttribArray(KL.aMUVB);
			gl.vertexAttribPointer(KL.aMUVB, 2, gl.FLOAT, false, stride, 24);
			gl.enableVertexAttribArray(KL.aMUVS);
			gl.vertexAttribPointer(KL.aMUVS, 2, gl.FLOAT, false, stride, 32);
			gl.enableVertexAttribArray(KL.aPC);
			gl.vertexAttribPointer(KL.aPC, 3, gl.FLOAT, false, stride, 40);

			gl.uniform2f(KL.uVP, cssW, cssH);
			gl.uniform2f(KL.uBO, this.boardLeft, this.boardTop);
			gl.uniform1f(KL.uIZ, this.boardInvZoom);
			gl.uniform1i(KL.uMask, 0);

			for (var ri = 0; ri < pickAtlasRanges.length; ri++) {
				var r = pickAtlasRanges[ri];
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, this.maskAtlases[r.atlas]);
				gl.drawArrays(gl.TRIANGLES, r.start * VERTS_PER_PIECE, r.count * VERTS_PER_PIECE);
			}

			gl.disableVertexAttribArray(KL.aQP);
			gl.disableVertexAttribArray(KL.aOff);
			gl.disableVertexAttribArray(KL.aPS);
			gl.disableVertexAttribArray(KL.aMUVB);
			gl.disableVertexAttribArray(KL.aMUVS);
			gl.disableVertexAttribArray(KL.aPC);
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, pw, ph);
		gl.enable(gl.BLEND);
		this._pickDirty = false;
	};

	Jigsaw.prototype.pieceIndexFromPoint = function(viewportX, viewportY) {
		this._renderPickBuffer();
		var gl = this.gl;
		var dpr = window.devicePixelRatio || 1;
		var px = Math.round(viewportX * dpr);
		var py = this.canvas.height - Math.round(viewportY * dpr);

		gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickFBO);
		var pixel = new Uint8Array(4);
		gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);

		var idx = pixel[0] + (pixel[1] << 8) + (pixel[2] << 16);
		if (idx === 0 || pixel[3] === 0) return -1;
		return idx - 1;
	};

	Jigsaw.prototype.initialize = function(state) {
		this.deriveEndSeeds();

		this.groups = {};
		this.groupOrder = [];

		var numPieces = this.rows * this.columns;
		var initialGroups = {};
		var orderedGroups = [];
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
				group.position = [arr[2], arr[3]];
				this.groups[groupIndex] = group;
				orderedGroups.push(group);
			}.bind(this));
		}

		for (var i = 0; i < numPieces; ++i) {
			if (initialGroups.hasOwnProperty(i)) continue;
			initialGroups[i] = i;
			var group = new JigsawGroup(i, [i]);
			this.groups[i] = group;
			orderedGroups.push(group);
		}

		// init WebGL
		this.boardLeft = 0;
		this.boardTop = 0;
		this.boardInvZoom = 1;
		this.initWebGL();
		this._loadImageTexture();

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

		this.pieces = [];
		for (var y = 0; y < this.rows; ++y) {
			for (var x = 0; x < this.columns; ++x) {
				var index = y * this.columns + x;
				var topEnd = 0, rightEnd = 0, bottomEnd = 0, leftEnd = 0;
				var topIndex = -1, rightIndex = -1, bottomIndex = -1, leftIndex = -1;
				if (x > 0) { leftEnd = this.verticalSeeds[y][x-1]; leftIndex = index - 1; }
				if (x < this.columns - 1) { rightEnd = -this.verticalSeeds[y][x]; rightIndex = index + 1; }
				if (y > 0) { topEnd = this.horizontalSeeds[y-1][x]; topIndex = index - this.columns; }
				if (y < this.rows - 1) { bottomEnd = -this.horizontalSeeds[y][x]; bottomIndex = index + this.columns; }

				var piece = new JigsawPiece(index, this.groups[initialGroups[index]],
					this.imagePath, this.imageWidth, this.imageHeight,
					lefts[x], tops[y], widths[x], heights[y], endWidth, endHeight,
					[topEnd, rightEnd, bottomEnd, leftEnd],
					[topIndex, rightIndex, bottomIndex, leftIndex]);

				this.pieces.push(piece);
			}
		}

		this._createMaskAtlas();

		orderedGroups.forEach(function(group) {
			var groupPiece = this.pieces[group.index];
			group.pieceIndices.forEach(function(pieceIndex) {
				var piece = this.pieces[pieceIndex];
				piece.localPosition = [piece.clipLeft - groupPiece.clipLeft, piece.clipTop - groupPiece.clipTop];
			}.bind(this));

			group.position = this.clipGroupPosition(group, group.globalLeft, group.globalTop);
			this.updateGroupWeightAndZIndex(group, false);
			this.groupOrder.push(group.index);
		}.bind(this));

		this.installMouseEvents();
		this.installTouchEvents();
		this._startRenderLoop();
	};

	Object.defineProperty(Jigsaw.prototype, 'boardPosition', {
		get: function() {
			return { x: this.boardLeft, y: this.boardTop, z: this.boardInvZoom };
		},

		set: function(pos) {
			var left = Math.min(Math.max(pos.x, -this.boardWidth), this.boardWidth);
			var top = Math.min(Math.max(pos.y, -this.boardHeight), this.boardHeight);
			var invZoom = Math.min(Math.max(pos.z, 1), this.maxInvZoom);

			if (left === this.boardLeft && top === this.boardTop && invZoom === this.boardInvZoom) return;

			this.boardLeft = left;
			this.boardTop = top;
			this.boardInvZoom = invZoom;
			this._dirty = true;
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
		this._dirty = true;
	};

	Jigsaw.prototype.serializeState = function() {
		var state = [];

		for (var i = 0; i < this.groupOrder.length; i++) {
			var groupIndex = this.groupOrder[i];
			var group = this.groups[groupIndex];
			if (!group) continue;

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

	Jigsaw.prototype._viewportLocalFromEvent = function(e) {
		var rect = this.parent.getBoundingClientRect();
		return {
			x: e.pageX - window.pageXOffset - rect.left,
			y: e.pageY - window.pageYOffset - rect.top
		};
	};

	Jigsaw.prototype.pieceIndexFromTargetElement = function(target) {
		// for backward compat, delegate to point-based hit test if possible
		return -1;
	};

	Jigsaw.prototype.installMouseEvents = function() {
		this.parent.unselectable = 'on';

		var onselectstart;
		this.parent.addEventListener('selectstart', onselectstart = function() {
			return false;
		}, false);

		var oncontextmenu;
		this.parent.addEventListener('contextmenu', oncontextmenu = function(e) {
			e.preventDefault();
		}, false);

		var self = this;

		var onmousemove_hover;
		this.parent.addEventListener('mousemove', onmousemove_hover = function(e) {
			var local = self._viewportLocalFromEvent(e);
			var idx = self.pieceIndexFromPoint(local.x, local.y);
			var newHovered = idx >= 0 ? self.pieces[idx].group.index : -1;
			if (newHovered !== self._hoveredGroupIndex) {
				self._hoveredGroupIndex = newHovered;
				self._dirty = true;
			}
		}, false);

		var onmousedown;
		this.parent.addEventListener('mousedown', onmousedown = function(e) {
			e.preventDefault();

			var movingPiece = false, movingBoard = false;
			if (e.button === 0) {
				if (e.ctrlKey) {
					movingBoard = true;
				} else {
					movingPiece = true;
				}
			} else if (e.button === 1 || e.button === 2) {
				movingBoard = true;
			}

			var endMove, updateMove;
			if (movingPiece) {
				var local = self._viewportLocalFromEvent(e);
				var index = self.pieceIndexFromPoint(local.x, local.y);
				if (index < 0) return;

				var group = self.pieces[index].group;
				if (group.cursors['']) return;
				var pos = self.translateToViewport(e);
				if (!self.startMove('', 0, index, pos.left * self.boardInvZoom - self.boardLeft, pos.top * self.boardInvZoom - self.boardTop)) return;

				updateMove = function(e) {
					var pos = self.translateToViewport(e);
					if (self.updateMove('', 0, pos.left * self.boardInvZoom - self.boardLeft, pos.top * self.boardInvZoom - self.boardTop)) {
						self.scrollOnEdge([[e.pageX, e.pageY]]);
						return true;
					} else {
						return false;
					}
				};

				endMove = function(e) {
					var pos = self.translateToViewport(e);
					if (self.endMove('', 0, pos.left * self.boardInvZoom - self.boardLeft, pos.top * self.boardInvZoom - self.boardTop)) {
						self.scrollOnEdge([[e.pageX, e.pageY]]);
					}
				};
			} else if (movingBoard) {
				var startBoardLeft = self.boardLeft;
				var startBoardTop = self.boardTop;
				var startClientX = e.clientX;
				var startClientY = e.clientY;

				updateMove = function(e) {
					self.boardPosition = {
						x: startBoardLeft + (e.clientX - startClientX) * self.boardInvZoom,
						y: startBoardTop + (e.clientY - startClientY) * self.boardInvZoom,
						z: self.boardInvZoom
					};
					return true;
				};

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
				if (prevButton === e.button || (prevButton === 1 && e.button === 2) || (prevButton === 2 && e.button === 1) || e.buttons === 0) {
					uninstall();
					endMove(e);
				}
			}
			d.addEventListener('mousemove', onmousemove, true);
			d.addEventListener('mouseup', onmouseup, true);
			if (d.setCapture) d.setCapture();
		}, false);

		var onwheel;
		this.parent.addEventListener('wheel', onwheel = function(e) {
			e.preventDefault();
			e.stopPropagation();

			if (e.ctrlKey) {
				var deltaZ = (e.deltaY > 0 ? self.wheelZoomIncrement : e.deltaY < 0 ? -self.wheelZoomIncrement : 0);
				self.boardPosition = {
					x: self.boardLeft,
					y: self.boardTop,
					z: self.boardInvZoom + deltaZ
				};
			} else {
				var deltaX = e.deltaX, deltaY = e.deltaY;
				if (e.deltaMode === 1) { deltaX *= 40; deltaY *= 40; }
				else if (e.deltaMode === 2) { deltaX *= 800; deltaY *= 800; }

				self.boardPosition = {
					x: self.boardLeft - deltaX * self.boardInvZoom,
					y: self.boardTop - deltaY * self.boardInvZoom,
					z: self.boardInvZoom
				};
			}
		}, false);

		this.uninstallMouseEvents = function() {
			delete this.parent.unselectable;
			this.parent.removeEventListener('selectstart', onselectstart, false);
			this.parent.removeEventListener('contextmenu', oncontextmenu, false);
			this.parent.removeEventListener('mousedown', onmousedown, false);
			this.parent.removeEventListener('wheel', onwheel, false);
			this.parent.removeEventListener('mousemove', onmousemove_hover, false);
		};
	};

	Jigsaw.prototype.installTouchEvents = function() {
		var DELAYED = 0;
		var ONE = 1;
		var TWO = 2;
		var TWO_MINUS_ONE = 3;

		var touches = {};
		var delayedTouchIdentifier = null;
		var boardIsMoving = false;
		var self = this;

		function translateIdentifier(id) {
			return (id < 0 ? id : id + 1);
		}

		var boardPositionFromTwoTouches = function(t1, t2) {
			var midViewportX = (t1.viewportX + t2.viewportX) / 2;
			var midViewportY = (t1.viewportY + t2.viewportY) / 2;
			var distanceX = t1.viewportX - t2.viewportX;
			var distanceY = t1.viewportY - t2.viewportY;
			var distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
			if (!t1.start.zoomEnabled) {
				var rect = self.parent.getBoundingClientRect();
				var minSide = Math.min(rect.right - rect.left, rect.bottom - rect.top);
				t1.start.zoomEnabled = Math.abs(t1.start.distance - distance) > minSide * self.touchZoomChangeThreshold;
			}
			var invZoom = (t1.start.zoomEnabled ? t1.start.boardInvZoom * t1.start.distance / distance : self.boardInvZoom);

			return {
				x: t1.start.boardLeft + (midViewportX - t1.start.midViewportX) * invZoom,
				y: t1.start.boardTop + (midViewportY - t1.start.midViewportY) * invZoom,
				z: invZoom
			};
		};

		var lastTimer = -1;
		var checkDelayedTouch = function(now) {
			if (delayedTouchIdentifier === null) return;

			var touch = touches[delayedTouchIdentifier];
			var remaining = touch.start.when - now + self.touchGestureLatency * 1000;
			if (remaining <= 0) {
				delete touches[delayedTouchIdentifier];
				var identifier = delayedTouchIdentifier;
				delayedTouchIdentifier = null;

				var pieceIndex = touch.start.index;
				if (pieceIndex < 0) return;

				var group = self.pieces[pieceIndex].group;
				if (group.cursors['']) return;

				var startX = touch.start.viewportX * touch.start.boardInvZoom - touch.start.boardLeft;
				var startY = touch.start.viewportY * touch.start.boardInvZoom - touch.start.boardTop;
				if (!self.startMove('', identifier, touch.start.index, startX, startY)) return;

				var x = touch.viewportX * touch.boardInvZoom - touch.boardLeft;
				var y = touch.viewportY * touch.boardInvZoom - touch.boardTop;
				if (startX !== x || startY !== y) {
					self.updateMove('', identifier, x, y);
				}
				touches[identifier] = { state: ONE, index: pieceIndex };
			} else {
				if (lastTimer >= 0) clearTimeout(lastTimer);
				lastTimer = setTimeout(function() {
					checkDelayedTouch(self.now());
				}, remaining);
			}
		};

		var ontouchstart = function(e) {
			e.preventDefault();
			e.stopPropagation();

			var now = self.now();
			for (var i = 0, t; t = e.changedTouches[i]; ++i) {
				var identifier = translateIdentifier(t.identifier);

				if (delayedTouchIdentifier === null) {
					delayedTouchIdentifier = identifier;

					var local = self._viewportLocalFromEvent(t);
					var index = self.pieceIndexFromPoint(local.x, local.y);
					var pos = self.translateToViewport(t);
					touches[identifier] = {
						state: DELAYED,
						start: {
							when: now,
							index: index,
							viewportX: pos.left,
							viewportY: pos.top,
							boardLeft: self.boardLeft,
							boardTop: self.boardTop,
							boardInvZoom: self.boardInvZoom
						},
						viewportX: pos.left,
						viewportY: pos.top,
						boardLeft: self.boardLeft,
						boardTop: self.boardTop,
						boardInvZoom: self.boardInvZoom
					};
				} else {
					var otherIdentifier = delayedTouchIdentifier;
					delayedTouchIdentifier = null;

					if (boardIsMoving) {
						delete touches[otherIdentifier];
					} else {
						var otherTouch = touches[otherIdentifier];

						self.boardPosition = {
							x: self.boardLeft + (otherTouch.viewportX - otherTouch.start.viewportX) * self.boardInvZoom,
							y: self.boardTop + (otherTouch.viewportY - otherTouch.start.viewportY) * self.boardInvZoom,
							z: self.boardInvZoom
						};

						var pos = self.translateToViewport(t);
						var distanceX = pos.left - otherTouch.viewportX;
						var distanceY = pos.top - otherTouch.viewportY;
						var start = {
							midViewportX: (pos.left + otherTouch.viewportX) / 2,
							midViewportY: (pos.top + otherTouch.viewportY) / 2,
							distance: Math.sqrt(distanceX * distanceX + distanceY * distanceY),
							zoomEnabled: false,
							boardLeft: self.boardLeft,
							boardTop: self.boardTop,
							boardInvZoom: self.boardInvZoom
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
		};

		var ontouchmove = function(e) {
			e.preventDefault();

			var updateMoves = [];
			for (var i = 0, t; t = e.changedTouches[i]; ++i) {
				var identifier = translateIdentifier(t.identifier);
				var touch = touches[identifier];
				if (!touch) continue;

				var pos = self.translateToViewport(t);
				switch (touch.state) {
					case DELAYED:
						touch.viewportX = pos.left;
						touch.viewportY = pos.top;
						touch.boardLeft = self.boardLeft;
						touch.boardTop = self.boardTop;
						break;

					case ONE:
						updateMoves.push({ i: identifier, p: pos, t: t });
						break;

					case TWO:
						touch.viewportX = pos.left;
						touch.viewportY = pos.top;
						self.boardPosition = boardPositionFromTwoTouches(touch, touches[touch.other]);
						break;

					case TWO_MINUS_ONE:
						self.boardPosition = {
							x: touch.boardLeft + (pos.left - touch.viewportX) * self.boardInvZoom,
							y: touch.boardTop + (pos.top - touch.viewportY) * self.boardInvZoom,
							z: self.boardInvZoom
						};
						break;
				}
			}

			updateMoves = updateMoves.filter(function(t) {
				if (self.updateMove('', t.i, t.p.left * self.boardInvZoom - self.boardLeft, t.p.top * self.boardInvZoom - self.boardTop)) {
					return true;
				} else {
					delete touches[t.i];
					return false;
				}
			});
			self.scrollOnEdge(updateMoves.map(function(t) { return [t.t.pageX, t.t.pageY]; }));
		};

		var ontouchend = function(e) {
			e.preventDefault();

			var endMoves = [];
			for (var i = 0, t; t = e.changedTouches[i]; ++i) {
				var identifier = translateIdentifier(t.identifier);
				var touch = touches[identifier];
				if (!touch) continue;
				delete touches[identifier];

				var pos = self.translateToViewport(t);
				switch (touch.state) {
					case DELAYED:
						delayedTouchIdentifier = null;
						break;

					case ONE:
						endMoves.push({ i: identifier, p: pos, t: t });
						break;

					case TWO:
						var otherTouch = touches[touch.other];
						self.boardPosition = boardPositionFromTwoTouches(touch, otherTouch);
						touches[touch.other] = {
							state: TWO_MINUS_ONE,
							viewportX: otherTouch.viewportX,
							viewportY: otherTouch.viewportY,
							boardLeft: self.boardLeft,
							boardTop: self.boardTop
						};
						break;

					case TWO_MINUS_ONE:
						boardIsMoving = false;
						self.boardPosition = {
							x: touch.boardLeft + (pos.left - touch.viewportX) * self.boardInvZoom,
							y: touch.boardTop + (pos.top - touch.viewportY) * self.boardInvZoom,
							z: self.boardInvZoom
						};
						break;
				}
			}

			endMoves = endMoves.filter(function(t) {
				return self.endMove('', t.i, t.p.left * self.boardInvZoom - self.boardLeft, t.p.top * self.boardInvZoom - self.boardTop);
			});
			self.scrollOnEdge(endMoves.map(function(t) { return [t.t.pageX, t.t.pageY]; }));
		};

		this.parent.addEventListener('touchstart', ontouchstart, false);
		this.parent.addEventListener('touchmove', ontouchmove, false);
		this.parent.addEventListener('touchend', ontouchend, false);
		this.parent.addEventListener('touchcancel', ontouchend, false);

		this.uninstallTouchEvents = function() {
			self.parent.removeEventListener('touchstart', ontouchstart, false);
			self.parent.removeEventListener('touchmove', ontouchmove, false);
			self.parent.removeEventListener('touchend', ontouchend, false);
			self.parent.removeEventListener('touchcancel', ontouchend, false);
		};
	};

	Jigsaw.prototype.scrollOnEdge = function(pageCoords) {
		if (pageCoords.length === 0) return;

		var scrollX = window.pageXOffset;
		var scrollY = window.pageYOffset;
		var rect = this.parent.getBoundingClientRect();

		var leftDistance = Number.POSITIVE_INFINITY;
		var rightDistance = Number.POSITIVE_INFINITY;
		var topDistance = Number.POSITIVE_INFINITY;
		var bottomDistance = Number.POSITIVE_INFINITY;
		pageCoords.forEach(function(pos) {
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

	Jigsaw.prototype.finalize = function() {
		if (this._rafId) {
			cancelAnimationFrame(this._rafId);
			this._rafId = 0;
		}
		if (this.uninstallMouseEvents) {
			this.uninstallMouseEvents();
			delete this.uninstallMouseEvents;
		}
		if (this.uninstallTouchEvents) {
			this.uninstallTouchEvents();
			delete this.uninstallTouchEvents;
		}

		if (this.gl) {
			var gl = this.gl;
			if (this.maskAtlases) {
				for (var i = 0; i < this.maskAtlases.length; i++) gl.deleteTexture(this.maskAtlases[i]);
			}
			if (this.imageTex) gl.deleteTexture(this.imageTex);
			if (this.pickColorTex) gl.deleteTexture(this.pickColorTex);
			if (this.pickFBO) gl.deleteFramebuffer(this.pickFBO);
			if (this.quadBuf) gl.deleteBuffer(this.quadBuf);
			if (this.batchBuf) gl.deleteBuffer(this.batchBuf);
			if (this.outlineBuf) gl.deleteBuffer(this.outlineBuf);
			if (this.pickBuf) gl.deleteBuffer(this.pickBuf);
			if (this.bgProg) gl.deleteProgram(this.bgProg);
			if (this.boundProg) gl.deleteProgram(this.boundProg);
			if (this.pieceProg) gl.deleteProgram(this.pieceProg);
			if (this.shadowProg) gl.deleteProgram(this.shadowProg);
			if (this.outlineProg) gl.deleteProgram(this.outlineProg);
			if (this.pickProg) gl.deleteProgram(this.pickProg);
			if (this.glowProg) gl.deleteProgram(this.glowProg);
		}

		if (this.canvas && this.canvas.parentNode) {
			this.canvas.parentNode.removeChild(this.canvas);
		}

		delete this.canvas;
		delete this.gl;
		delete this.boardLeft;
		delete this.boardTop;
		delete this.groups;
		delete this.groupOrder;
		delete this.pieces;
		delete this.horizontalSeeds;
		delete this.verticalSeeds;
		delete this.maskAtlases;
		delete this._batchFloat;
		delete this._outlineFloat;
		delete this._pickFloat;
		this.imageLoaded = false;
	};

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
		group.moving = moving;
		this._dirty = true;
	};

	Jigsaw.prototype.updateGroupPositionFromExistingCursors = function(group) {
		var weight = group.weight;

		var numCursors = 0;
		var totalX = 0;
		var totalY = 0;
		for (var origin in group.cursors) {
			for (var cursor in group.cursors[origin]) {
				var ongoing = nestedMapGet(this.ongoingMoves, origin, +cursor);
				if (!ongoing) continue;

				totalX += ongoing.startX + ((ongoing.lastCursorX - ongoing.startCursorX) / weight | 0) - ongoing.piece.localLeft;
				totalY += ongoing.startY + ((ongoing.lastCursorY - ongoing.startCursorY) / weight | 0) - ongoing.piece.localTop;
				++numCursors;
			}
		}

		if (numCursors > 0) {
			group.position = this.clipGroupPosition(group, (totalX / numCursors) | 0, (totalY / numCursors) | 0);
			this._dirty = true;
			return true;
		} else {
			return false;
		}
	};

	Jigsaw.prototype._moveGroupToFront = function(group) {
		var idx = this.groupOrder.indexOf(group.index);
		if (idx >= 0) this.groupOrder.splice(idx, 1);
		this.groupOrder.push(group.index);
	};

	Jigsaw.prototype.startMove = function(origin, cursor, index, globalX, globalY) {
		origin = origin.toString();
		cursor = +cursor;

		var piece = this.pieces[index];
		if (!piece) return false;

		var group = piece.group;

		this._moveGroupToFront(group);
		this.updateGroupWeightAndZIndex(group, true);
		if (!origin) {
			group.localMoving = true;
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
		if (!origin) {
			group.localMoving = false;
		}

		if (!this.updateGroupPositionFromExistingCursors(group)) {
			var weight = group.weight;
			group.position = this.clipGroupPosition(group,
				ongoing.startX + ((globalX - ongoing.startCursorX) / weight | 0) - ongoing.piece.localLeft,
				ongoing.startY + ((globalY - ongoing.startCursorY) / weight | 0) - ongoing.piece.localTop);
		}

		this._dirty = true;

		if (!origin) {
			if (this.onEndMove) {
				this.onEndMove(cursor, piece, globalX, globalY);
			}
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
		if (!origin) {
			group.localMoving = false;
		}

		this._dirty = true;

		if (this.onCancelMove && !origin) {
			this.onCancelMove(ongoing.piece);
		}

		return true;
	};

	Jigsaw.prototype.checkSnap = function(triggeredGroupIndex) {
		var triggeredGroupPiece = this.pieces[triggeredGroupIndex];
		if (!triggeredGroupPiece) return;

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
		if (groups.length === 0) return;

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

		groups.push(triggeredGroupIndex);
		this.mergeGroups(largestGroupIndex, groups);
		if (this.onSnap) {
			this.onSnap(largestGroupIndex, groups);
		}
	};

	Jigsaw.prototype.mergeGroups = function(mergedGroupIndex, otherGroupIndices) {
		var mergedGroup = this.groups[mergedGroupIndex];
		if (!mergedGroup) return false;

		var anyPiece = this.pieces[mergedGroupIndex];
		var deltaX = anyPiece.localLeft - anyPiece.clipLeft;
		var deltaY = anyPiece.localTop - anyPiece.clipTop;

		otherGroupIndices.forEach(function(g) {
			var group = this.groups[g];
			if (!group) return;
			if (g === mergedGroupIndex) return;
			delete this.groups[g];

			Array.prototype.push.apply(mergedGroup.pieceIndices, group.pieceIndices);
			for (var origin in group.cursors) {
				for (var cursor in group.cursors[origin]) {
					nestedMapAdd(mergedGroup.cursors, origin, cursor, group.cursors[origin][cursor]);
				}
			}

			// remove from groupOrder
			var idx = this.groupOrder.indexOf(g);
			if (idx >= 0) this.groupOrder.splice(idx, 1);
		}.bind(this));

		mergedGroup.pieceIndices.sort(function(a, b) { return a - b; });

		mergedGroup.pieceIndices.forEach(function(index) {
			var piece = this.pieces[index];
			piece.localPosition = [piece.clipLeft + deltaX, piece.clipTop + deltaY];
			piece.group = mergedGroup;
		}.bind(this));

		this._moveGroupToFront(mergedGroup);
		this._dirty = true;

		return true;
	};

	////////////////////////////////////////////////////////////////////////////////

	window.Jigsaw = Jigsaw;
})(window)

// vim: ts=4 sw=4 sts=4
