// The release number. tools/deploy.py bumps nothing by itself: edit this, then run `python3 tools/deploy.py "what changed"`.
// VERSION is the ENGINE version (records and the server pin to it): it changes only with engine changes, which are made on main and merged here.
export const VERSION = '0.10.0';
// BUILD names the redesign build published at /magic-realm-next/ (tools/deploy.py --channel next checks for it); empty on main.
export const BUILD = 'next.37';
