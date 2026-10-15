// Cloudflare Workers Free allows 50 external subrequests per invocation (D1 and asset bindings count separately).
// One scheduled run spends at most CHECK_SUBREQUESTS on public checks; notifications get what checks left, less
// WATCH_SUBREQUESTS kept for the monitoring watch's owner notices and external heartbeat.
export const RUN_SUBREQUESTS=50,CHECK_SUBREQUESTS=35,WATCH_SUBREQUESTS=3
export class BudgetExhausted extends Error {constructor(){super('Scheduled run subrequest budget exhausted')}}
export class SubrequestBudget {
 constructor(public remaining:number){}
 /** Sets aside `count` for one unit of work; spending beyond it draws on what is still unreserved. */
 reserve(count:number){if(count>this.remaining)return null;this.remaining-=count;return new Allowance(this,count)}
}
export class Allowance {
 constructor(private budget:SubrequestBudget,private left:number){}
 spend(){if(this.left>0)this.left--;else if(this.budget.remaining>0)this.budget.remaining--;else throw new BudgetExhausted()}
 release(){this.budget.remaining+=this.left;this.left=0}
}
