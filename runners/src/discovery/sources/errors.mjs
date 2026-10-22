// A source run that cannot continue, with a message the owner reads. It never carries a credential or a response body.
export class SourceError extends Error {constructor(code,message){super(message);this.code=code}}
