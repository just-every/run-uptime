// Names the real reason a webhook URL was refused, so the person can fix that part instead of rereading a generic rule.
export function destinationRefusal(value:unknown):string{
 const text=typeof value==='string'?value.trim():''
 let url:URL
 try{url=new URL(text)}catch{return 'Enter the full URL, starting with https://'}
 if(url.protocol!=='https:')return 'The URL must start with https://'
 if(url.username||url.password)return 'Remove the username and password from the URL'
 if(url.hash)return 'Remove the # fragment from the end of the URL'
 if(url.port&&url.port!=='443')return `Remove the :${url.port} port. Destinations must use the standard HTTPS port`
 const host=url.hostname.toLowerCase()
 if(host==='localhost'||/\.(localhost|local|internal|invalid|test)$/.test(host))return `${host} is not a public host name, so Uptime cannot send to it. Use a public host name, not localhost or a name ending in .local, .internal, .invalid or .test`
 if(host.includes(':')||/^[\d.]+$/.test(host))return `${host} is a private or reserved address. Use a public host name or address`
 if(text.length>8192)return 'The URL is too long'
 return `${host} is not a valid public host name`
}
