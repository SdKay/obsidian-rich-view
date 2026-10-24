import { describe, expect, it } from 'vitest';
import { placeText } from '../src/visioTextBox';

describe('placeText: defaults keep text where it was drawn before alignment was read', () => {
	it('a shape that sets nothing puts its text at the middle of the shape, centred both ways', () => {
		const p = placeText({ width: 2, height: 1 });
		expect(p).toMatchObject({ x: 1, y: 0.5, hAlign: 'middle', vAlign: 'middle' });
	});
	it('equal margins on both sides do not move centred text', () => {
		const p = placeText({ width: 2, height: 1, leftMargin: 0.1, rightMargin: 0.1, topMargin: 0.05, bottomMargin: 0.05 });
		expect(p.x).toBeCloseTo(1, 10);
		expect(p.y).toBeCloseTo(0.5, 10);
	});
});

describe('placeText: the Application shape (2.05 x 1.75, top, left, small margins)', () => {
	const app = { width: 2.05, height: 1.75, leftMargin: 0.0417, rightMargin: 0.0417, topMargin: 0.0278, bottomMargin: 0.0278, horzAlign: 0, verticalAlign: 0 };
	it('starts at the top left corner of the content area, not the middle', () => {
		const p = placeText(app);
		expect(p.hAlign).toBe('start');
		expect(p.vAlign).toBe('top');
		expect(p.x).toBeCloseTo(0.0417, 10);
		expect(p.y).toBeCloseTo(1.75 - 0.0278, 10);
	});
	it('offers the width inside the margins for wrapping', () => {
		expect(placeText(app).contentWidth).toBeCloseTo(2.05 - 2 * 0.0417, 10);
	});
});

describe('placeText: every alignment', () => {
	const box = { width: 4, height: 2, leftMargin: 0, rightMargin: 0, topMargin: 0, bottomMargin: 0 };
	it('horizontal: left, centre, right (justify behaves as left)', () => {
		expect(placeText({ ...box, horzAlign: 0 })).toMatchObject({ x: 0, hAlign: 'start' });
		expect(placeText({ ...box, horzAlign: 1 })).toMatchObject({ x: 2, hAlign: 'middle' });
		expect(placeText({ ...box, horzAlign: 2 })).toMatchObject({ x: 4, hAlign: 'end' });
		expect(placeText({ ...box, horzAlign: 3 })).toMatchObject({ x: 0, hAlign: 'start' });
	});
	it('vertical: top, middle, bottom (Y grows upward in the shape\'s own coordinates)', () => {
		expect(placeText({ ...box, verticalAlign: 0 })).toMatchObject({ y: 2, vAlign: 'top' });
		expect(placeText({ ...box, verticalAlign: 1 })).toMatchObject({ y: 1, vAlign: 'middle' });
		expect(placeText({ ...box, verticalAlign: 2 })).toMatchObject({ y: 0, vAlign: 'bottom' });
	});
	it('margins pull each edge in', () => {
		const p = placeText({ ...box, horzAlign: 0, verticalAlign: 2, leftMargin: 0.5, bottomMargin: 0.25 });
		expect(p.x).toBe(0.5);
		expect(p.y).toBe(0.25);
		const q = placeText({ ...box, horzAlign: 2, verticalAlign: 0, rightMargin: 0.5, topMargin: 0.25 });
		expect(q.x).toBe(3.5);
		expect(q.y).toBe(1.75);
	});
	it('an unknown alignment value falls back to centred', () => {
		expect(placeText({ ...box, horzAlign: 9, verticalAlign: 9 })).toMatchObject({ hAlign: 'middle', vAlign: 'middle', x: 2, y: 1 });
	});
});

describe('placeText: a text box of its own (TxtWidth, TxtPin, TxtLocPin)', () => {
	const noMargin = { leftMargin: 0, rightMargin: 0, topMargin: 0, bottomMargin: 0 };
	it('a narrower text box centred on the shape keeps the middle but offers less width', () => {
		const p = placeText({ width: 4, height: 2, txtWidth: 2, txtHeight: 1, ...noMargin });
		expect(p).toMatchObject({ x: 2, y: 1, contentWidth: 2 });
	});
	it('a moved text box moves the text: pin at the right edge, anchored by its own left edge', () => {
		const p = placeText({ width: 4, height: 2, txtWidth: 1, txtHeight: 1, txtPinX: 4, txtPinY: 1, txtLocPinX: 0, txtLocPinY: 0.5, horzAlign: 0, verticalAlign: 1, ...noMargin });
		expect(p.x).toBe(4);
		expect(p.y).toBe(1);
	});
	it('left alignment starts at the text box\'s own left edge, not the shape\'s', () => {
		const p = placeText({ width: 4, height: 2, txtWidth: 1, txtHeight: 1, txtPinX: 3, txtPinY: 1, txtLocPinX: 0.5, txtLocPinY: 0.5, horzAlign: 0, verticalAlign: 0, ...noMargin });
		expect(p.x).toBe(2.5);
		expect(p.y).toBe(1.5);
	});
	it('defaults the anchor to the text box centre when only a pin is given', () => {
		const p = placeText({ width: 4, height: 2, txtWidth: 2, txtHeight: 1, txtPinX: 3, txtPinY: 1, ...noMargin });
		expect(p).toMatchObject({ x: 3, y: 1 });
	});
});

describe('placeText: Visio\'s own default margin of 4 pt applies when the shape sets none', () => {
	// Measured against Visio\'s export of a real file: 278 text blocks with no margin cells were exported with 4 pt
	// on every side, which is why a top-aligned label sat 5.3 px lower than a zero-margin layout puts it.
	const DEFAULT = 4 / 72;
	it('top aligned text starts one default margin below the top edge', () => {
		expect(placeText({ width: 2, height: 1, verticalAlign: 0 }).y).toBeCloseTo(1 - DEFAULT, 10);
	});
	it('bottom aligned text sits one default margin above the bottom edge', () => {
		expect(placeText({ width: 2, height: 1, verticalAlign: 2 }).y).toBeCloseTo(DEFAULT, 10);
	});
	it('left aligned text starts one default margin in from the left edge, right aligned ends one in from the right', () => {
		expect(placeText({ width: 2, height: 1, horzAlign: 0 }).x).toBeCloseTo(DEFAULT, 10);
		expect(placeText({ width: 2, height: 1, horzAlign: 2 }).x).toBeCloseTo(2 - DEFAULT, 10);
	});
	it('the width offered for wrapping is the text box less a default margin each side', () => {
		expect(placeText({ width: 2, height: 1 }).contentWidth).toBeCloseTo(2 - 2 * DEFAULT, 10);
	});
	it('does not move centred text: the margins are equal on both sides', () => {
		const p = placeText({ width: 2, height: 1 });
		expect(p.x).toBeCloseTo(1, 10);
		expect(p.y).toBeCloseTo(0.5, 10);
	});
	it('a margin the shape does set wins, including an explicit zero', () => {
		expect(placeText({ width: 2, height: 1, verticalAlign: 0, topMargin: 0 }).y).toBe(1);
		expect(placeText({ width: 2, height: 1, horzAlign: 0, leftMargin: 0.5 }).x).toBe(0.5);
	});
});
