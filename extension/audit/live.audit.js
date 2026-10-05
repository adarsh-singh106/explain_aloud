// @vitest-environment node
// Opt-in local smoke check. Synthetic content only; uses the existing loopback Ollama client.
import { expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildNarrationPlanFromIR } from '@/src/pipeline/pipeline';
it.skipIf(process.env.EXPLAIN_ALOUD_AUDIT_LIVE !== '1')('LIVE local synthetic code/table plan, without TTS',async()=>{
  const blocks=[
    {id:'code',order:0,type:'code',raw:'<pre>print(42)</pre>',structured:{language:'python',code:'print(42)'}},
    {id:'table',order:1,type:'table',raw:'<table/>',structured:{headers:['Model','Accuracy','Latency'],rows:[['A','92%','4 sec'],['B','88%','1 sec'],['C','90%','2 sec']]}},
  ];
  const source={schemaVersion:'1.0',site:'chatgpt',responseId:'audit-synthetic',blocks,facts:[]};
  const start=performance.now();const result=await buildNarrationPlanFromIR(source);
  const evidence={date:new Date().toISOString(),elapsedMs:Math.round(performance.now()-start),model:'gemma4:e4b',scope:'Synthetic local Ollama plan only; no TTS/browser',result};
  writeFileSync(resolve(process.cwd(),'../docs/audit-live-result.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({elapsedMs:evidence.elapsedMs,stats:result.validationStats,segments:result.plan.segments}));
  expect(result.plan.segments.length).toBeGreaterThan(0);
},25000);
