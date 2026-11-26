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
 get reserved(){return this.left}
 expand(count:number){
  if(count>this.budget.remaining)throw new BudgetExhausted();
  this.budget.remaining-=count;
  this.left+=count;
 }
 spend(count=1){
  const reserved=Math.min(this.left,count),extra=count-reserved;
  if(extra>this.budget.remaining)throw new BudgetExhausted();
  this.left-=reserved;
  this.budget.remaining-=extra;
 }
 release(){this.budget.remaining+=this.left;this.left=0}
}
