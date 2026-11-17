import {corpus,epoch,get,copy,zip} from './transport.mjs'

const accountId='000000000000',region='us-east-1'
const arn=(service,resource)=>`arn:aws:${service}:${region}:${accountId}:${resource}`
const role=`arn:aws:iam::${accountId}:role/synthetic-canary-execution`
const input=(path,query={})=>({method:'POST',path,query})
const sources={
 browser:`const synthetics = require('Synthetics');\nconst assert = require('node:assert/strict');\nexports.handler = async () => {\n  const page = await synthetics.getPage();\n  await synthetics.executeStep('synthetic-home', async () => {\n    await page.goto('https://canary-browser.example.test/');\n    assert.equal(await page.title(), 'Synthetic home');\n  });\n};\n`,
 api:`const synthetics = require('Synthetics');\nexports.handler = async () => {\n  await synthetics.executeHttpStep('synthetic-api', {\n    hostname: 'canary-api.example.test', protocol: 'https:',\n    path: '/health', port: 443, method: 'GET'\n  }, async (response) => {\n    if (response.statusCode !== 200) throw new Error('Synthetic status assertion');\n  });\n};\n`
}

function canary(index){
 const name=index?'synthetic-api':'synthetic-browser'
 return {Id:`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,Name:name,Code:{Handler:'index.handler',SourceLocationArn:arn('lambda',`layer:${name}-code:1`),BlueprintTypes:[],Dependencies:[]},ExecutionRoleArn:role,Schedule:{Expression:'rate(5 minutes)',DurationInSeconds:0,RetryConfig:{MaxRetries:0}},RunConfig:{TimeoutInSeconds:30,MemoryInMB:960,ActiveTracing:false,EphemeralStorage:1024},RuntimeVersion:'syn-nodejs-puppeteer-10.0',Status:{State:index?'STOPPED':'RUNNING',StateReason:'Synthetic source state, not current local health',StateReasonCode:'UPDATE_COMPLETE'},Timeline:{Created:epoch-90*86400,LastModified:epoch-86400,LastStarted:epoch-7200,LastStopped:epoch-3600},ArtifactS3Location:`s3://synthetic-artifacts-example/${name}/`,SuccessRetentionPeriodInDays:31,FailureRetentionPeriodInDays:31,Tags:{environment:'synthetic',service:index?'api':'browser'},EngineArn:arn('lambda',`function:${name}-engine`),ArtifactConfig:{S3Encryption:{EncryptionMode:'SSE_S3'}},ProvisionedResourceCleanup:'OFF',...(index?{}:{BrowserConfigs:[{BrowserType:'CHROME'}]})}
}

function alarm(name,canaryName,fields={}){
 return {AlarmName:name,AlarmArn:arn('cloudwatch',`alarm:${name}`),AlarmDescription:'Synthetic source alarm — review required',AlarmConfigurationUpdatedTimestamp:epoch-86400,ActionsEnabled:true,AlarmActions:[arn('sns','synthetic-alarm-topic')],OKActions:[arn('sns','synthetic-recovery-topic')],InsufficientDataActions:[],StateValue:'OK',StateReason:'Synthetic source state, never local evidence',StateReasonData:'{"synthetic":true}',StateUpdatedTimestamp:epoch-300,StateTransitionedTimestamp:epoch-600,Namespace:'CloudWatchSynthetics',MetricName:'SuccessPercent',Statistic:'Average',Dimensions:[{Name:'CanaryName',Value:canaryName}],Period:300,Unit:'Percent',EvaluationPeriods:1,DatapointsToAlarm:1,Threshold:100,ComparisonOperator:'LessThanThreshold',TreatMissingData:'missing',...fields}
}

export function buildAws(){
 const notes=[
  {id:'sdk-operation-parameters',description:'request.query contains documented SDK operation parameters, not an assertion about HTTP wire query serialization. DescribeCanaries and DescribeAlarms use POST.'},
  {id:'code-input-boundary',description:'CanaryCodeInput is separately supplied local input, never a field returned inside GetCanary.Code. ZIP packages are deterministic synthetic files. Code references are not fetched.'},
  {id:'no-aws-authority',description:'Dummy account 000000000000 and reserved targets only. IAM/KMS/S3/Lambda/SNS identifiers remain inert source metadata.'}
 ]
 const c=corpus('aws-synthetics',{accountId,region},notes),canaries=[canary(0),canary(1)]
 for(let i=0;i<2;i++){
  c.add(`canaries/list-${i}.json`,'canaries-list',{Canaries:[canaries[i]],NextToken:`synthetic-page-${i+1}`},{recordCount:1,request:input('/canaries',{MaxResults:1,...(i?{NextToken:'synthetic-page-1'}:{})}),pagination:{...(i?{token:'synthetic-page-1'}:{}),nextToken:`synthetic-page-${i+1}`}})
  c.add(`canaries/detail-${canaries[i].Name}.json`,'canary-detail',{Canary:canaries[i]},{sourceId:canaries[i].Id,request:get(`/canary/${canaries[i].Name}`)})
  const packageBytes=zip([{name:'nodejs/node_modules/index.js',body:sources[i?'api':'browser']}])
  c.put(`code/${canaries[i].Name}.zip`,packageBytes)
  c.add(`code/${canaries[i].Name}-input.json`,'canary-code-input',{Handler:'index.handler',ZipFile:packageBytes.toString('base64')},{sourceId:canaries[i].Id,request:{method:'LOCAL',path:`canary-code-input/${canaries[i].Name}`,query:{}}})
 }
 c.add('canaries/list-terminal.json','canaries-list',{Canaries:[]},{recordCount:0,request:input('/canaries',{MaxResults:1,NextToken:'synthetic-page-2'}),pagination:{token:'synthetic-page-2'}})
 const metricAlarms=[
  alarm('synthetic-availability','synthetic-browser'),
  alarm('synthetic-duration','synthetic-api',{MetricName:'Duration',Unit:'Milliseconds',Threshold:2000,ComparisonOperator:'GreaterThanThreshold'}),
  alarm('synthetic-n-of-m','synthetic-browser',{EvaluationPeriods:5,DatapointsToAlarm:3,TreatMissingData:'breaching'})
 ]
 const math=alarm('synthetic-math','synthetic-api',{Threshold:99,EvaluationPeriods:3,DatapointsToAlarm:2,Metrics:[{Id:'m1',Label:'Synthetic success',ReturnData:false,AccountId:accountId,MetricStat:{Metric:{Namespace:'CloudWatchSynthetics',MetricName:'SuccessPercent',Dimensions:[{Name:'CanaryName',Value:'synthetic-api'}]},Period:300,Stat:'Average',Unit:'Percent'}},{Id:'e1',Expression:'AVG(m1)',Label:'Synthetic expression',ReturnData:true,Period:300}]})
 for(const key of ['MetricName','Namespace','Statistic','Dimensions','Period','Unit'])delete math[key]
 metricAlarms.push(math)
 const composite={AlarmName:'synthetic-composite',AlarmArn:arn('cloudwatch','alarm:synthetic-composite'),AlarmDescription:'Synthetic composite expression',AlarmConfigurationUpdatedTimestamp:epoch-86400,AlarmRule:'ALARM("synthetic-availability") OR ALARM("synthetic-duration")',ActionsEnabled:false,AlarmActions:[arn('sns','synthetic-composite-topic')],OKActions:[],InsufficientDataActions:[],StateValue:'INSUFFICIENT_DATA',StateReason:'Synthetic imported state',StateReasonData:'{"synthetic":true}',StateUpdatedTimestamp:epoch-600,StateTransitionedTimestamp:epoch-900,ActionsSuppressor:arn('cloudwatch','alarm:synthetic-maintenance'),ActionsSuppressorWaitPeriod:60,ActionsSuppressorExtensionPeriod:120,ActionsSuppressedBy:'WaitPeriod',ActionsSuppressedReason:'Synthetic suppression'}
 c.add('alarms/list-0.json','alarms-list',{MetricAlarms:metricAlarms.slice(0,2),CompositeAlarms:[],NextToken:'synthetic-alarm-page-1'},{recordCount:2,request:input('/',{Action:'DescribeAlarms',Version:'2010-08-01',AlarmTypes:['MetricAlarm','CompositeAlarm'],MaxRecords:2}),pagination:{nextToken:'synthetic-alarm-page-1'}})
 c.add('alarms/list-1.json','alarms-list',{MetricAlarms:metricAlarms.slice(2),CompositeAlarms:[composite]},{recordCount:3,request:input('/',{Action:'DescribeAlarms',Version:'2010-08-01',AlarmTypes:['MetricAlarm','CompositeAlarm'],MaxRecords:100,NextToken:'synthetic-alarm-page-1'}),pagination:{token:'synthetic-alarm-page-1'}})
 const result=c.finish({canaries:2,canaryPages:3,codePackages:2,metricAlarms:4,compositeAlarms:1,alarmPages:2})
 return {...result,canaries,metricAlarms,composite,sources,notes}
}

export function awsProposals(aws){
 const variants={}
 const variant=(name,change)=>{const value=copy(aws.canaries[0]);change(value);variants[name]={Canary:value}}
 variant('one-minute',v=>v.Schedule.Expression='rate(1 minute)')
 variant('cron',v=>v.Schedule.Expression='cron(0/5 * * * ? *)')
 variant('run-once',v=>v.Schedule.Expression='rate(0 minute)')
 variant('finite-duration',v=>v.Schedule.DurationInSeconds=3600)
 variant('vpc',v=>v.VpcConfig={VpcId:'vpc-00000000000000001',SubnetIds:['subnet-00000000000000001'],SecurityGroupIds:['sg-00000000000000001'],Ipv6AllowedForDualStack:true})
 variant('firefox',v=>{v.RuntimeVersion='syn-nodejs-puppeteer-11.0';delete v.EngineArn;v.BrowserConfigs=[{BrowserType:'FIREFOX'}];v.EngineConfigs=[{EngineArn:arn('lambda','function:synthetic-firefox-engine'),BrowserType:'FIREFOX'}]})
 variant('unknown-runtime',v=>v.RuntimeVersion='synthetic-unknown-runtime-99.0')
 variant('visual-baselines',v=>{const visual={BaseCanaryRunId:'00000000-0000-4000-8000-000000000010',BrowserType:'CHROME',BaseScreenshots:[{ScreenshotName:'synthetic-home.png',IgnoreCoordinates:['0,0,10,10']}]};v.VisualReference=visual;v.VisualReferences=[copy(visual)]})
 variant('full-metadata',v=>{
  v.Code.Dependencies=[{Type:'LambdaLayer',Reference:arn('lambda','layer:synthetic-dependency:1')}]
  v.ArtifactConfig.S3Encryption={EncryptionMode:'SSE_KMS',KmsKeyArn:arn('kms','key/00000000-0000-4000-8000-000000000001')};v.KmsKeyArn=arn('kms','key/00000000-0000-4000-8000-000000000002')
  v.DryRunConfig={DryRunId:'00000000-0000-4000-8000-000000000020',LastDryRunExecutionStatus:'PASSED'}
  v.MultiLocationConfig={LocationType:'Primary',PrimaryLocation:region,ReplicationState:'InSync',Replicas:[{Location:'eu-west-1',CanaryState:'RUNNING',LastModified:epoch-3600,ReplicationStatus:{State:'InSync',StateReason:'Synthetic replicated',StateReasonCode:'SYNCHRONIZED'},VpcConfig:{VpcId:'vpc-00000000000000002',SubnetIds:['subnet-00000000000000002'],SecurityGroupIds:['sg-00000000000000002'],Ipv6AllowedForDualStack:false}}]}
 })
 const extraAlarm=copy(aws.metricAlarms[1]);delete extraAlarm.Statistic
 Object.assign(extraAlarm,{ExtendedStatistic:'p95',EvaluateLowSampleCountPercentile:'ignore',EvaluationState:'PARTIAL_DATA',ThresholdMetricId:'e1',ActionConfiguration:{AlarmTagsPropagation:{Enabled:true,IncludedTagKeys:['environment'],ExcludedTagKeys:['synthetic-private']}},EvaluationWindow:{WallClockWindow:{Timezone:'UTC'}},WarmUpConfiguration:{WarmUpPeriodDurationInMinutes:5,OnlyStartEvaluatingAfterWarmUpPeriodEnds:true},EvaluationCriteria:{PromQLCriteria:{Query:'synthetic_success < 1',PendingPeriod:300,RecoveryPeriod:300}},EvaluationInterval:60})
 variants['alarm-extra-metadata']={MetricAlarms:[extraAlarm],CompositeAlarms:[{...copy(aws.composite),ActionConfiguration:copy(extraAlarm.ActionConfiguration)}]}
 variants['code-input-s3-alternative']={S3Bucket:'synthetic-source-example',S3Key:'code/synthetic.zip',S3Version:'synthetic-version',BlueprintTypes:['multi-checks'],Dependencies:[{Type:'LambdaLayer',Reference:arn('lambda','layer:synthetic-dependency:1')}]}
 variants['run-config-input-alternative']={TimeoutInSeconds:30,MemoryInMB:960,ActiveTracing:false,EnvironmentVariables:{SYNTHETIC_API_TOKEN:'SYNTHETIC_LOCAL_SECRET_AWS_ENV'},EphemeralStorage:1024}
 return variants
}
