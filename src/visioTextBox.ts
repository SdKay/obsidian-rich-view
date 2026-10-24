/** Visio's own enumerations for where text sits in its box. */
export type HAlign = 'start' | 'middle' | 'end';
export type VAlign = 'top' | 'middle' | 'bottom';

export interface TextBoxInput {
	width: number;
	height: number;
	/** The cell values, or undefined when the shape does not set them (Visio then uses its defaults). */
	txtWidth?: number;
	txtHeight?: number;
	txtPinX?: number;
	txtPinY?: number;
	txtLocPinX?: number;
	txtLocPinY?: number;
	leftMargin?: number;
	rightMargin?: number;
	topMargin?: number;
	bottomMargin?: number;
	/** Paragraph `HorzAlign`: 0 left, 1 centre, 2 right, 3 justify (treated as left). */
	horzAlign?: number;
	/** `VerticalAlign`: 0 top, 1 middle, 2 bottom. */
	verticalAlign?: number;
}

export interface TextPlacement {
	/** Reference point in the shape's own coordinates (origin bottom-left, Y up): the content area's edge or centre. */
	x: number;
	y: number;
	hAlign: HAlign;
	vAlign: VAlign;
	/** Width available to the text once margins are taken off. */
	contentWidth: number;
}

/**
 * Visio's text margin when a shape sets none: 4 pt on every side (1/18 inch). Measured against Visio's own SVG export
 * of a real file, where every text block of a shape without margin cells came out with `rect(4,4,4,4)`.
 */
const DEFAULT_MARGIN_IN = 4 / 72;

const H: Record<number, HAlign> = { 0: 'start', 1: 'middle', 2: 'end', 3: 'start' };
const V: Record<number, VAlign> = { 0: 'top', 1: 'middle', 2: 'bottom' };

/**
 * Where the text of a shape sits, in the shape's own coordinates. The text box has its own size, position and
 * anchor (all defaulting to "the whole shape, centred"), margins shrink it to a content area, and the text is
 * aligned against that area's edge or centre. A shape that sets none of this gets the middle of the shape,
 * exactly where text was drawn before alignment was read.
 */
export function placeText(input: TextBoxInput): TextPlacement {
	const tw = input.txtWidth ?? input.width;
	const th = input.txtHeight ?? input.height;
	const pinX = input.txtPinX ?? input.width / 2;
	const pinY = input.txtPinY ?? input.height / 2;
	const locX = input.txtLocPinX ?? tw / 2;
	const locY = input.txtLocPinY ?? th / 2;
	const left = pinX - locX + (input.leftMargin ?? DEFAULT_MARGIN_IN);
	const right = pinX - locX + tw - (input.rightMargin ?? DEFAULT_MARGIN_IN);
	const bottom = pinY - locY + (input.bottomMargin ?? DEFAULT_MARGIN_IN);
	const top = pinY - locY + th - (input.topMargin ?? DEFAULT_MARGIN_IN);

	const hAlign = H[input.horzAlign ?? 1] ?? 'middle';
	const vAlign = V[input.verticalAlign ?? 1] ?? 'middle';
	return {
		x: hAlign === 'start' ? left : hAlign === 'end' ? right : (left + right) / 2,
		y: vAlign === 'top' ? top : vAlign === 'bottom' ? bottom : (top + bottom) / 2,
		hAlign,
		vAlign,
		contentWidth: Math.max(0, right - left),
	};
}

/** The font settings a shape's first character row carries; a field is absent when the file does not set it. */
export interface FontSettings {
	family?: string;
	color?: string;
	/** Size in inches, as Visio stores it. */
	sizeIn?: number;
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
}

export interface TextLayout {
	box: TextBoxInput;
	font: FontSettings;
}

function cellValue(el: Element, name: string): string | undefined {
	for (const c of Array.from(el.children)) {
		if (c.tagName === 'Cell' && c.getAttribute('N') === name) {
			// A text cell with no value is "not set", not an empty name.
			const v = c.getAttribute('V');
			return v === null || v === '' ? undefined : v;
		}
	}
	return undefined;
}

function optionalNum(el: Element | undefined, name: string): number | undefined {
	if (!el) return undefined;
	const v = cellValue(el, name);
	if (v === undefined) return undefined;
	const n = parseFloat(v);
	return Number.isNaN(n) ? undefined : n;
}

function firstRow(shapeEl: Element, section: string): Element | undefined {
	const sec = Array.from(shapeEl.children).find(c => c.tagName === 'Section' && c.getAttribute('N') === section);
	return sec ? Array.from(sec.children).find(c => c.tagName === 'Row') : undefined;
}

/**
 * Everything a shape says about how its text is laid out and styled: the text box, margins, alignment, and the
 * font. Only what the file sets is returned, so a missing cell falls through to Visio's own default (or the
 * renderer's) instead of being turned into a number that was never there. Only the first character and
 * paragraph rows are read: text with several formats in one label is drawn in the first one's style.
 */
export function readTextLayout(shapeEl: Element): TextLayout {
	const num = (name: string) => optionalNum(shapeEl, name);
	const box: TextBoxInput = {
		width: optionalNum(shapeEl, 'Width') ?? 0,
		height: optionalNum(shapeEl, 'Height') ?? 0,
	};
	const set = <K extends keyof TextBoxInput>(key: K, value: TextBoxInput[K] | undefined) => { if (value !== undefined) box[key] = value; };
	set('txtWidth', num('TxtWidth'));
	set('txtHeight', num('TxtHeight'));
	set('txtPinX', num('TxtPinX'));
	set('txtPinY', num('TxtPinY'));
	set('txtLocPinX', num('TxtLocPinX'));
	set('txtLocPinY', num('TxtLocPinY'));
	set('leftMargin', num('LeftMargin'));
	set('rightMargin', num('RightMargin'));
	set('topMargin', num('TopMargin'));
	set('bottomMargin', num('BottomMargin'));
	set('verticalAlign', num('VerticalAlign'));
	set('horzAlign', optionalNum(firstRow(shapeEl, 'Paragraph'), 'HorzAlign'));

	const font: FontSettings = {};
	const row = firstRow(shapeEl, 'Character');
	if (row) {
		const family = cellValue(row, 'Font');
		if (family !== undefined) font.family = family;
		const color = cellValue(row, 'Color');
		if (color !== undefined) font.color = color;
		const size = optionalNum(row, 'Size');
		if (size !== undefined) font.sizeIn = size;
		const style = optionalNum(row, 'Style');
		if (style !== undefined) {
			font.bold = (style & 1) !== 0;
			font.italic = (style & 2) !== 0;
			font.underline = (style & 4) !== 0;
		}
	}
	return { box, font };
}
