import branding from '../branding.json' with {type:'json'}

// The shell of the server-rendered documents outside the console: sign in, the owner claim, first-run setup, the sent page and the HTML 404.
// Each is one self-contained page: inline CSS only, the self-hosted Plus Jakarta Sans, and the mark drawn inline, so the
// strict policy below allows nothing but this origin's two font files and the tab icon.
export const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,value=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[value]!));
export const productName=escapeHtml(branding.name);

const font='/design-assets/fonts/plus-jakarta-sans-latin-wght-normal.woff2';

// The faces and the metric-matched fallback are copied from src/site/shell/styles/fonts.css, and the colour values from
// src/site/shell/styles/tokens.css (plus the app's --field-line and --ink-hover); a change there changes this file too.
const fonts=`@font-face{font-family:'Plus Jakarta Sans';font-style:normal;font-weight:200 800;font-display:swap;src:url('${font}') format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:'Plus Jakarta Sans';font-style:normal;font-weight:200 800;font-display:swap;src:url('/design-assets/fonts/plus-jakarta-sans-latin-ext-wght-normal.woff2') format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:'Plus Jakarta Sans Fallback';font-weight:100 450;src:local('Arial'),local('ArialMT'),local('Liberation Sans'),local('LiberationSans');size-adjust:103.64%;ascent-override:100.15%;descent-override:21.42%;line-gap-override:0%}
@font-face{font-family:'Plus Jakarta Sans Fallback';font-weight:451 549;src:local('Arial'),local('ArialMT'),local('Liberation Sans'),local('LiberationSans');size-adjust:104.77%;ascent-override:99.07%;descent-override:21.19%;line-gap-override:0%}
@font-face{font-family:'Plus Jakarta Sans Fallback';font-weight:550 649;src:local('Arial Bold'),local('Arial-BoldMT'),local('Liberation Sans Bold'),local('LiberationSans-Bold');size-adjust:98.88%;ascent-override:104.98%;descent-override:22.45%;line-gap-override:0%}
@font-face{font-family:'Plus Jakarta Sans Fallback';font-weight:650 900;src:local('Arial Bold'),local('Arial-BoldMT'),local('Liberation Sans Bold'),local('LiberationSans-Bold');size-adjust:99.94%;ascent-override:103.86%;descent-override:22.21%;line-gap-override:0%}`;

// One white card on the morning ground, with the site's faint dawn wash at the top of the page and nothing else.
const base=`:root{--ink:#14204a;--ink-hover:#22306a;--body:#3b4466;--muted:#5f6684;--ground:#f7f6fb;--card:#ffffff;--line:#e5e6f2;--field-line:#8a8fa8;--sky-top:#e9e8f6;--horizon:#fbe3cf;--sans:'Plus Jakarta Sans','Plus Jakarta Sans Fallback','Avenir Next','Segoe UI',sans-serif;--radius:18px;--shadow:0 1px 2px rgba(20,32,74,.04),0 10px 30px -14px rgba(20,32,74,.16),0 28px 60px -36px rgba(20,32,74,.18);color-scheme:light}
*,*::before,*::after{box-sizing:border-box}
html{background:var(--ground)}
body{margin:0;min-height:100vh;display:grid;justify-items:center;align-content:start;padding:clamp(24px,16vh,150px) 16px 48px;color:var(--body);font:400 17px/1.6 var(--sans);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;background:radial-gradient(60% 420px at 88% 0,rgba(251,227,207,.6),rgba(251,227,207,0) 72%) no-repeat,linear-gradient(180deg,var(--sky-top) 0,rgba(247,246,251,0) 380px) no-repeat,var(--ground)}
main{width:min(100%,520px)}
a{color:var(--ink)}
:focus-visible{outline:3px solid var(--ink);outline-offset:3px}
::selection{background:#dcdcf4;color:var(--ink)}
.brand{display:inline-flex;align-items:center;gap:10px;min-height:44px;margin:0 0 14px 20px;color:var(--ink);text-decoration:none;border-radius:8px}
.brand svg{display:block;width:34px;height:34px;flex:none}
.brand span{font-size:31px;font-weight:700;letter-spacing:-.035em;line-height:1}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:40px}
h1{margin:0 0 16px;color:var(--ink);font-size:clamp(28px,5vw,36px);font-weight:700;line-height:1.15;letter-spacing:-.025em}
p{margin:0 0 28px}
p:last-child{margin-bottom:0}
.text-link{display:inline-flex;align-items:center;min-height:44px;font-weight:600;text-decoration:underline;text-decoration-color:rgba(20,32,74,.4);text-decoration-thickness:2px;text-underline-offset:5px;border-radius:8px}
.text-link:hover{text-decoration-color:var(--ink)}
@media (max-width:480px){body{padding-top:24px}.brand{margin-left:4px}.brand svg{width:28px;height:28px}.brand span{font-size:26px}.card{padding:28px 20px}p{margin-bottom:24px}}
@media (prefers-reduced-motion:no-preference){button,.pill,.text-link{transition:background-color .15s,text-decoration-color .15s}}`;

// An inline copy of src/site/shell/Mark.tsx: the dial open at the top, its 12 o'clock stretch peach. Decorative beside the word.
export const mark='<svg viewBox="0 0 32 32" width="34" height="34" fill="none" aria-hidden="true" focusable="false"><path d="M24.49 9.83A10.5 10.5 0 1 1 7.51 9.83" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><path d="M11.73 6.41A10.5 10.5 0 0 1 20.27 6.41" stroke="#e8894f" stroke-width="3.2" stroke-linecap="round"/></svg>';

export const documentHeaders={'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'strict-origin','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"};

// The page: the lockup linking home above one card. `style` adds the page's own rules after the shared ones.
export function shellDocument({title,card,style=''}:{title:string;card:string;style?:string}){
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preload" href="${font}" as="font" type="font/woff2" crossorigin><style>${fonts}
${base}
${style}</style></head><body><main><a class="brand" href="/">${mark}<span>${productName}</span></a><div class="card">${card}</div></main></body></html>`;
}

const notFoundStyle=`.eyebrow{display:block;margin:0 0 10px;color:var(--muted);font-size:12px;font-weight:700;letter-spacing:.12em;line-height:1.3;text-transform:uppercase}
.actions{display:flex;flex-wrap:wrap;align-items:center;gap:12px 28px}
.pill{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 24px;border-radius:999px;background:var(--ink);color:#fff;font-weight:600;line-height:1;text-decoration:none;box-shadow:0 1px 1px rgba(20,32,74,.12),0 10px 24px -12px rgba(20,32,74,.55)}
.pill:hover{background:var(--ink-hover)}
.pill:focus-visible{outline-offset:4px}`;

// Any unknown document path. The status, no-store and the policy match the other documents; the body names no installation data.
export function notFoundDocument(){
 return new Response(shellDocument({title:`Page not found · ${productName}`,style:notFoundStyle,card:`<span class="eyebrow">Error 404</span><h1>Page not found</h1><p>There is no page at this address. Check the link, or start again from the home page.</p><div class="actions"><a class="pill" href="/">Go to the home page</a><a class="text-link" href="/app">Open the console</a></div>`}),{status:404,headers:documentHeaders});
}
