/**
 * Anchors handed to rich-search and read back when a hit is opened. Private to Rich View (contract 5.7).
 * `line` is the position of the text line inside its shape or text box (0-based, blank lines not counted):
 * a shape whose label has several lines gives several search results, and without it rich-search could not
 * tell us which of them was clicked.
 */
export interface DrawioAnchor { page: string; cellId: string; line: number }
export interface VisioAnchor { page: string; shapeId: string; line: number }
export interface SlideAnchor { slide: number; nodeId: string; line: number }

export const drawioAnchor = (page: string, cellId: string, line: number): DrawioAnchor => ({ page, cellId, line });
export const visioAnchor = (page: string, shapeId: string, line: number): VisioAnchor => ({ page, shapeId, line });
export const slideAnchorOf = (slide: number, nodeId: string, line: number): SlideAnchor => ({ slide, nodeId, line });
