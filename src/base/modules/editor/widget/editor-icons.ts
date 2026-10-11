/** Shared outline family from the approved 12ui editor conversion. */
export const editorIconPaths = {
 picture:['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z','M9.5 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0','m4 19 6-7 4 4 3-4 4 7'],
 mic:['M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0Z','M5 11v2a7 7 0 0 0 14 0v-2m-7 9v3m-3 0h6'],
 send:['m5 3 16 9-16 9 4-9Z','M9 12h12'],
 history:['M3 10a10 10 0 1 1 1 8M1 7l2 5 5-1m4-5v6l4 2'],
 settings:['m9 2 6 0 1 3 3 1 3 4-2 3 1 4-4 3-3-1-3 3-4-2v-4l-3-2 1-5 3-1Z','M15.4 12a3.4 3.4 0 1 1-6.8 0 3.4 3.4 0 0 1 6.8 0'],
 close:['m6 6 12 12M6 18 18 6'],
 open:['m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z'],
} as const
export type EditorIconName=keyof typeof editorIconPaths
export const editorIconViewBox='0 0 24 24'
export const editorIconStrokeWidth=1.8
