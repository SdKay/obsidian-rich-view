/** Stack tried after the file's own font, for machines that do not have it. Generic names only. */
const FALLBACK = 'system-ui, "Segoe UI", Arial, Helvetica, sans-serif';

/**
 * The CSS font-family value for a font name taken from a Visio file, or undefined when the file names none
 * (the renderer then keeps drawing with the font it always used). The name is quoted, with its quotes and
 * backslashes escaped, so an odd name can neither break out of the value nor inject other CSS.
 */
export function fontStack(family: string | undefined): string | undefined {
	const name = family?.trim();
	if (!name) return undefined;
	const quoted = `"${name.replace(/[\\"]/g, '\\$&').replace(/[\r\n]+/g, ' ')}"`;
	return `${quoted}, ${FALLBACK}`;
}

/** The font part of a canvas `font` shorthand, e.g. `italic bold 12px "Calibri", ...`. */
export function canvasFont(sizePx: number, family: string | undefined, bold: boolean | undefined, italic: boolean | undefined): string {
	const stack = fontStack(family) ?? 'sans-serif';
	return `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${sizePx}px ${stack}`;
}
