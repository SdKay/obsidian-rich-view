import { describe, expect, it } from 'vitest';
import { readTextLayout } from '../src/visioTextBox';

const el = (xml: string): Element => new DOMParser().parseFromString(xml, 'application/xml').documentElement;
const shape = (inner: string) => el(`<Shape ID='1'><Cell N='Width' V='2.05'/><Cell N='Height' V='1.75'/>${inner}</Shape>`);

describe('readTextLayout: a real container shape (the Application box in zephyr_pm_sw_arch.vsdx)', () => {
	const application = shape(`
		<Cell N='LeftMargin' V='0.04166666666666666' U='PT'/><Cell N='RightMargin' V='0.04166666666666666' U='PT'/>
		<Cell N='TopMargin' V='0.02777777777777778' U='PT'/><Cell N='BottomMargin' V='0.02777777777777778' U='PT'/>
		<Cell N='VerticalAlign' V='0'/>
		<Section N='Character'><Row IX='0'><Cell N='Font' V='Calibri'/><Cell N='Color' V='#000000'/><Cell N='Style' V='1'/><Cell N='Size' V='0.125' U='PT'/></Row></Section>
		<Section N='Paragraph'><Row IX='0'><Cell N='HorzAlign' V='0'/></Row></Section>`);

	it('reads the margins in inches, top-aligned, left-aligned', () => {
		const l = readTextLayout(application);
		expect(l.box).toMatchObject({ leftMargin: 0.04166666666666666, rightMargin: 0.04166666666666666, topMargin: 0.02777777777777778, bottomMargin: 0.02777777777777778, horzAlign: 0, verticalAlign: 0 });
	});
	it('reads the font, colour, size and style from the first character row', () => {
		const l = readTextLayout(application);
		expect(l.font).toMatchObject({ family: 'Calibri', color: '#000000', sizeIn: 0.125, bold: true, italic: false, underline: false });
	});
});

describe('readTextLayout: absent cells stay absent, so Visio defaults apply', () => {
	it('a shape that sets nothing has no alignment, margins or text box overrides', () => {
		const l = readTextLayout(shape(''));
		expect(l.box).toEqual({ width: 2.05, height: 1.75 });
		expect(l.font).toEqual({});
	});
	it('reads the text box cells when they are there', () => {
		const l = readTextLayout(shape(`<Cell N='TxtWidth' V='1.5'/><Cell N='TxtHeight' V='0.5'/><Cell N='TxtPinX' V='1'/><Cell N='TxtPinY' V='0.25'/><Cell N='TxtLocPinX' V='0.75'/><Cell N='TxtLocPinY' V='0.25'/>`));
		expect(l.box).toMatchObject({ txtWidth: 1.5, txtHeight: 0.5, txtPinX: 1, txtPinY: 0.25, txtLocPinX: 0.75, txtLocPinY: 0.25 });
	});
	it('does not turn a cell with no value into 0', () => {
		const l = readTextLayout(shape(`<Cell N='LeftMargin'/><Cell N='VerticalAlign' V=''/>`));
		expect(l.box.leftMargin).toBeUndefined();
		expect(l.box.verticalAlign).toBeUndefined();
	});
	it('does not turn text that is not a number into NaN', () => {
		const l = readTextLayout(shape(`<Cell N='TopMargin' V='abc'/>`));
		expect(l.box.topMargin).toBeUndefined();
	});
});

describe('readTextLayout: empty text values', () => {
	it('an empty font name or colour is treated as not set, not as a name of zero length', () => {
		const f = readTextLayout(shape(`<Section N='Character'><Row IX='0'><Cell N='Font' V=''/><Cell N='Color' V=''/></Row></Section>`)).font;
		expect(f.family).toBeUndefined();
		expect(f.color).toBeUndefined();
	});
});

describe('readTextLayout: character style bits', () => {
	const style = (v: number) => readTextLayout(shape(`<Section N='Character'><Row IX='0'><Cell N='Style' V='${v}'/></Row></Section>`)).font;
	it('bit 0 is bold, bit 1 italic, bit 2 underline', () => {
		expect(style(0)).toMatchObject({ bold: false, italic: false, underline: false });
		expect(style(1)).toMatchObject({ bold: true, italic: false, underline: false });
		expect(style(2)).toMatchObject({ bold: false, italic: true, underline: false });
		expect(style(4)).toMatchObject({ bold: false, italic: false, underline: true });
		expect(style(7)).toMatchObject({ bold: true, italic: true, underline: true });
	});
	it('ignores other bits such as small caps', () => {
		expect(style(8)).toMatchObject({ bold: false, italic: false, underline: false });
		expect(style(9)).toMatchObject({ bold: true, italic: false, underline: false });
	});
	it('a Style cell that is absent leaves the weight unspecified rather than normal', () => {
		const f = readTextLayout(shape(`<Section N='Character'><Row IX='0'><Cell N='Size' V='0.1'/></Row></Section>`)).font;
		expect(f.bold).toBeUndefined();
		expect(f.sizeIn).toBe(0.1);
	});
});

describe('readTextLayout: only the first rows are read, never a later run', () => {
	it('uses character row 0 and paragraph row 0 even when more rows follow', () => {
		const l = readTextLayout(shape(`<Section N='Character'><Row IX='0'><Cell N='Font' V='A'/></Row><Row IX='1'><Cell N='Font' V='B'/></Row></Section>
			<Section N='Paragraph'><Row IX='0'><Cell N='HorzAlign' V='2'/></Row><Row IX='1'><Cell N='HorzAlign' V='0'/></Row></Section>`));
		expect(l.font.family).toBe('A');
		expect(l.box.horzAlign).toBe(2);
	});
});
