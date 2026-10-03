/** Test stand-in for the host-provided `obsidian` module (the real package ships types only). */
export let language = 'en';
export function setLanguage(next: string): void { language = next; }
export function getLanguage(): string { return language; }
