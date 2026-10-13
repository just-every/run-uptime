import branding from './branding.json' with {type:'json'}
import {checkIdentity,type EditionIdentity} from './base/identity'
import {hero} from './site/landing/copy'

// What the installed Lobby (/) and the run site say about Uptime. The deployment's name is the owner's branding.json name;
// the theme declares the fonts, so no fonts stylesheet is named.
export const identity:EditionIdentity=checkIdentity({
 product:'Uptime',
 deployment:branding.name,
 purpose:'{deployment} checks your sites and APIs on schedule and tells you only when a failure is confirmed.',
 tagline:hero.sub,
 signInPath:'/login',
 runSite:'https://run-uptime.com',
 installedHome:'lobby',
 theme:'/rer-theme.css',
 mark:'/brand/mark.svg',
 band:'/brand/band.svg',
})
