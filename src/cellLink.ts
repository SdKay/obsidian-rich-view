/**
 * Add or update the link on a draw.io cell identified by `cellId`.
 * Handles both UserObject-wrapped cells and plain mxCell elements.
 * Passing an empty `link` removes the link attribute from a UserObject.
 */
export function patchCellLink(xmlContent: string, cellId: string, link: string): string {
	const doc = new DOMParser().parseFromString(xmlContent, 'application/xml');
	if (doc.querySelector('parsererror')) return xmlContent;

	// Escape double quotes so they survive inside an attribute selector string.
	const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

	// Case 1: cell is already wrapped in a UserObject.
	const userObj = doc.querySelector(`UserObject[id="${esc(cellId)}"]`);
	if (userObj) {
		if (link) userObj.setAttribute('link', link);
		else userObj.removeAttribute('link');
		return new XMLSerializer().serializeToString(doc);
	}

	// Case 2: plain mxCell — wrap it in a UserObject and set the link.
	if (!link) return xmlContent;
	const mxCell = doc.querySelector(`mxCell[id="${esc(cellId)}"]`);
	if (mxCell) {
		const label = mxCell.getAttribute('value') ?? '';
		const parent = mxCell.parentNode;
		// createElementNS (not createElement): `doc` is an XML document parsed from
		// the .drawio file, not UI DOM. draw.io's elements have no namespace, so
		// passing the cell's own (null) namespace yields the same plain element.
		const userObject = doc.createElementNS(mxCell.namespaceURI, 'UserObject');
		userObject.setAttribute('label', label);
		userObject.setAttribute('link', link);
		userObject.setAttribute('id', cellId);
		mxCell.removeAttribute('id');
		mxCell.removeAttribute('value');
		parent?.replaceChild(userObject, mxCell);
		userObject.appendChild(mxCell);
		return new XMLSerializer().serializeToString(doc);
	}

	return xmlContent;
}
