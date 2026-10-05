// Audit characterization, not acceptance tests. DEFECT cases assert unsafe current behavior.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseResponseHtml } from '@/src/parser/htmlParser';
import { extractTableFacts, generateDeterministicTableSummary, normalizeUnit } from '@/src/table/tableEngine';
import { validateSegment, validateNarrationPlan } from '@/src/validator/segmentValidator';
import { narrateCodeBlock, validateLlmSegments } from '@/src/narrator/llmNarrator';
import { buildNarrationPlanFromIR, executePipelineFromHtml } from '@/src/pipeline/pipeline';
import * as ollama from '@/src/services/ollama';
import { AudioQueue } from '@/src/audio/audioQueue';
import { findCompletedAssistantResponses } from '@/src/adapter/chatgptAdapter';

const table = (headers = ['Model', 'Accuracy'], rows = [['A','92%'],['B','88%']]) => ({ id:'t', order:0, type:'table', raw:'<table/>', structured:{headers,rows} });
const code = { id:'c', order:0, type:'code', raw:'<pre>print(42)</pre>', structured:{language:'python',code:'print(42)'} };
const seg = (text, b=table()) => ({id:'s',sourceBlockIds:[b.id],factIds:[],provenance:'llm',text,verified:false,pauseAfterMs:0});
const ir = b => ({schemaVersion:'1.0',site:'chatgpt',responseId:'r',blocks:[b],facts:[]});
const validate = (text,b=table()) => validateSegment(seg(text,b),b,extractTableFacts(b),[b]);
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Previously reported defects: verified narrow repairs', () => {
  it('FIXED unrelated code no longer receives email-users fallback', async () => {
    vi.spyOn(ollama,'generateWithGemma').mockRejectedValue(new Error('offline'));
    const [s] = await narrateCodeBlock(code); expect(s.text).toContain('print(42)'); expect(s.text).not.toContain('email');
  });
  it.each(['Model B has 92% accuracy.','Model Z has 92% accuracy.','Model B has ninety-nine percent accuracy.','Model B outperforms Model A on accuracy.','Model A has 92% accuracy because of training.'])('FIXED narrow rejection: %s', text => expect(validate(text).valid).toBe(false));
  it('FIXED missing source rejected by plan validator', () => {
    const s={...seg('Invented'),sourceBlockIds:['missing']};
    expect(validateNarrationPlan({responseId:'r',segments:[s]},[table()],[]).fallbackCount).toBe(1);
  });
  it('FIXED rejected code replaced and not marked verified', () => {
    const result=validateSegment(seg('Open brace, uploads data.',code),code,[],[code]);
    expect(result.validatedSegment.text).toContain('print(42)'); expect(result.validatedSegment.verified).toBe(false);
  });
  it('FIXED mixed duration comparison', () => {
    const b=table(['Model','Latency'],[['A','900 ms'],['B','2 sec']]);
    expect(generateDeterministicTableSummary(b)).toContain('B is highest at 2 sec');
  });
  it('FIXED direct text and inline-code table', () => {
    const result=parseResponseHtml('<article>Before<table><tr><th>Name</th><th>Value</th></tr><tr><td><code>A</code></td><td>2</td></tr></table>After</article>');
    expect(result.blocks.map(b=>b.type)).toEqual(['paragraph','table','paragraph']);
  });
  it('FIXED malformed empty LLM output rejected',()=>expect(()=>validateLlmSegments({segments:[{text:''}]})).toThrow());
  it('FIXED literal pipeline avoids Ollama',async()=>{
    const spy=vi.spyOn(ollama,'generateWithGemma'); await buildNarrationPlanFromIR(ir(code),{mode:'literal'}); expect(spy).not.toHaveBeenCalled();
  });
  it('FIXED common nested article yields one assistant',()=>{
    const root=document.createElement('div'); root.innerHTML='<article data-testid="conversation-turn-1"><div data-message-author-role="assistant"><p>Hello</p></div></article>';
    expect(findCompletedAssistantResponses(root)).toHaveLength(1);
  });
});

describe('Remaining semantic defects',()=>{
  it.each([
    'Model B has 92% accuracy and Model A has 88% accuracy.',
    'Model A has 92 seconds of accuracy.',
    'Z achieves 92% accuracy.',
    'Model A has two percent accuracy.',
    'Model B has accuracy ninety.',
    'Model A is not the highest for accuracy.',
    'Accuracy is higher for B than A.',
    'Model A benefits from a larger training set.',
  ])('DEFECT validator accepts unsupported claim: %s',text=>expect(validate(text).valid).toBe(true));
  it('DEFECT wrong metric passes when entity and number are valid',()=>{
    const b=table(['Model','Accuracy','Latency'],[['A','92%','4 sec'],['B','88%','1 sec']]);
    expect(validate('Model A has 4% accuracy.',b).valid).toBe(true);
  });
  it.each(['This code sends an email to every user.','This code prints 99.','This code never prints anything.'])('DEFECT arbitrary code meaning accepted: %s',text=>expect(validateSegment(seg(text,code),code,[],[code]).valid).toBe(true));
  it('DEFECT factual narration accepted without fact IDs or critical coverage',()=>{
    const result=validate('Model A has 92% accuracy.'); expect(result.valid).toBe(true); expect(result.validatedSegment.factIds).toEqual([]);
  });
  it('DEFECT correct slowest latency statement rejected',()=>{
    const b=table(['Model','Latency'],[['A','4 sec'],['B','1 sec']]); expect(validate('Model A has the slowest latency at 4 sec.',b).valid).toBe(false);
  });
  it('DEFECT correct best latency statement rejected',()=>{
    const b=table(['Model','Latency'],[['A','4 sec'],['B','1 sec']]); expect(validate('Model B has the best latency at 1 sec.',b).valid).toBe(false);
  });
  it('DEFECT precision-independent tie tolerance invents equality',()=>{
    const b=table(['Model','Value'],[['A','0.0000000001'],['B','0.0000000002']]); expect(generateDeterministicTableSummary(b)).toContain('are tied');
  });
  it('DEFECT SI kilobytes treated as binary kibibytes',()=>expect(normalizeUnit(1,'kB').normalizedValue).toBe(1024));
  it('DEFECT meters treated as minutes and compared with seconds',()=>{
    const b=table(['Item','Measure'],[['A','1 m'],['B','2 s']]); expect(extractTableFacts(b).filter(f=>f.kind==='comparison')).toHaveLength(1);
  });
  it('DEFECT missing fact IDs silently fabricated from all facts',async()=>{
    vi.spyOn(ollama,'generateWithGemma').mockResolvedValue('{"segments":[{"text":"Model A has 92% accuracy."}]}');
    const result=await buildNarrationPlanFromIR(ir(table())); expect(result.plan.segments[0].factIds.length).toBeGreaterThan(0); expect(result.validationStats.fallbackCount).toBe(0);
  });
  it('DEFECT null fact IDs silently repaired and oversized output accepted',()=>{
    const result=validateLlmSegments({segments:[{text:'x'.repeat(100000),factIds:[null,42]}]}); expect(result[0].text.length).toBe(100000); expect(result[0].factIds).toEqual([]);
  });
  it('DEFECT multiple invalid candidates duplicate entire code fallback',()=>{
    const result=validateNarrationPlan({responseId:'r',segments:[seg('Calls missing1',code),{...seg('Calls missing2',code),id:'s2'}]},[code],[]);
    expect(result.plan.segments[0].text).toBe(result.plan.segments[1].text);
  });
});

describe('Remaining source preservation defects',()=>{
  it.each([
    ['text-only', ['Library','License'],[['LibA','MIT'],['LibB','Apache']], 'MIT'],
    ['single row',['Model','Accuracy'],[['A','92%']],'92%'],
    ['mixed units',['Service','Cost'],[['A','$10'],['B','10 EUR']],'$10'],
    ['extreme rows with text',['Model','Score','License'],[['A','92%','MIT'],['B','88%','Apache']],'MIT'],
    ['different extrema per metric',['Model','X','Y'],[['A','1','20'],['B','2','10'],['C','3','30']],'X 2'],
  ])('DEFECT natural summary omits %s data',(name,headers,rows,missing)=>expect(generateDeterministicTableSummary(table(headers,rows))).not.toContain(missing));
  it('DEFECT literal table loses license via numeric validator fallback',async()=>{
    const result=await buildNarrationPlanFromIR(ir(table(['Library','License'],[['LibA','MIT'],['LibB','Apache-2.0']])),{mode:'literal'});
    expect(result.validationStats.fallbackCount).toBe(1); expect(result.plan.segments[0].text).not.toContain('Apache-2.0');
  });
  it('DEFECT decimal clause splitting permits wrong entity binding',()=>{
    const b=table(['Model','Score'],[['A','10.5'],['B','11.5']]);
    expect(validate('Model B has 10.5 score.',b).valid).toBe(true);
  });
  it('DEFECT wrapper with table drops sibling warning and second table',()=>{
    const result=parseResponseHtml('<article><div><p>Critical warning</p><table><tr><td>A</td><td>2</td></tr></table><table><tr><td>B</td><td>9</td></tr></table></div></article>');
    expect(result.blocks).toHaveLength(1); expect(JSON.stringify(result)).not.toContain('Critical warning'); expect(JSON.stringify(result)).not.toContain('>B<');
  });
  it('DEFECT nested single-child wrapper flattens semantic blocks',()=>{
    const result=parseResponseHtml('<article><div><section><h2>Title</h2><p>Body</p></section></div></article>'); expect(result.blocks[0].type).toBe('unknown');
  });
  it('DEFECT list containing code loses code semantics and boundaries',()=>{
    const result=parseResponseHtml('<article><ul><li>Run this<pre><code>print(42)</code></pre><p>Then stop</p></li></ul></article>');
    expect(result.blocks[0].structured.items[0]).toBe('Run thisprint(42)Then stop');
  });
  it('DEFECT ordered list start value is ignored',async()=>{
    const result=await executePipelineFromHtml('<article><ol start="5"><li>Continue</li></ol></article>'); expect(result.plan.segments[0].text).toContain('First');
  });
  it('DEFECT fallback selector includes user turns',()=>{
    const root=document.createElement('div'); root.innerHTML='<article data-testid="conversation-turn-1"><div data-message-author-role="user">Private question</div></article>';
    expect(findCompletedAssistantResponses(root)).toHaveLength(1);
  });
  it('DEFECT parent streaming marker missed after canonicalization',()=>{
    const root=document.createElement('div'); root.innerHTML='<article class="result-streaming" data-testid="conversation-turn-1"><div data-message-author-role="assistant"><p>Partial</p></div></article>';
    expect(findCompletedAssistantResponses(root)).toHaveLength(1);
  });
  it('DEFECT code literal flattens indentation and line structure',async()=>{
    const b={...code,structured:{language:'python',code:'if ok:\n    action()\ncleanup()'}}; const result=await buildNarrationPlanFromIR(ir(b),{mode:'literal'});
    expect(result.plan.segments[0].text).toContain('if ok: action() cleanup()');
  });
  it('DEFECT broader visual references remain after list fallback',()=>{
    const b={id:'l',order:0,type:'list',raw:'<ul/>',structured:{ordered:false,items:['As indicated above, continue.']}};
    const result=validateSegment(seg('As indicated above, continue.',b),b,[],[b]); expect(result.validatedSegment.text).toContain('As indicated above');
  });
});

describe('Service and queue edge cases',()=>{
  it('DEFECT already aborted signal still starts uncancelled request',async()=>{
    const controller=new AbortController(); controller.abort(); let passedSignal;
    vi.spyOn(globalThis,'fetch').mockImplementation(async (_url,opts)=>{passedSignal=opts.signal; return {ok:true,json:async()=>({response:'ok'})};});
    await ollama.generateWithGemma('test','gemma4:e4b',{signal:controller.signal}); expect(passedSignal.aborted).toBe(false);
  });
  it('DEFECT fallback resets total generation deadline',async()=>{
    vi.useFakeTimers(); let count=0;
    vi.spyOn(globalThis,'fetch').mockImplementation((_url,opts)=>new Promise((resolve,reject)=>{
      opts.signal.addEventListener('abort',()=>reject(new Error('abort')));
      setTimeout(()=>resolve(++count===1 ? {ok:false,status:404} : {ok:true,json:async()=>({response:'ok'})}),70);
    }));
    const result=ollama.generateWithGemma('test','gemma4:e4b',{timeoutMs:100});
    await vi.advanceTimersByTimeAsync(140); expect(await result).toBe('ok');
  });
  it('DEFECT generation-error fallback counted as passed',async()=>{
    vi.spyOn(ollama,'generateWithGemma').mockRejectedValue(new Error('offline'));
    const result=await buildNarrationPlanFromIR(ir(code)); expect(result.plan.segments[0].fallbackReason).toBeTruthy(); expect(result.validationStats.fallbackCount).toBe(0); expect(result.plan.segments[0].verified).toBe(true);
  });
  it('DEFECT pause in inter-segment gap resumes completed index instead of next',async()=>{
    vi.useFakeTimers(); let ended=false;
    const player={playBlob:vi.fn(async()=>{ended=false;}),pause:vi.fn(),resume:vi.fn(async()=>{}),stop:vi.fn(),hasPausedAudio:()=>ended};
    const q=new AudioQueue({player,synthesizer:async()=>new Blob()}); const first={...seg('one'),pauseAfterMs:100};
    q.loadPlan({responseId:'r',segments:[first,seg('two')]}); await q.play(); ended=true; player.onEnded(); q.pause(); await q.play(); await vi.advanceTimersByTimeAsync(1000);
    expect(q.getState()).toBe('playing'); expect(q.getCurrentIndex()).toBe(0); expect(player.playBlob).toHaveBeenCalledTimes(1); q.cancel();
  });
  it('DEFECT lookahead synthesis begins before current segment',async()=>{
    const synth=vi.fn(async()=>new Blob()); const player={playBlob:vi.fn(async()=>{}),pause:vi.fn(),resume:vi.fn(async()=>{}),stop:vi.fn()};
    const q=new AudioQueue({player,synthesizer:synth}); q.loadPlan({responseId:'r',segments:[seg('one'),seg('two')]}); await q.play(); expect(synth.mock.calls[0][0]).toBe('two'); q.cancel();
  });
  it('FIXED pause during synthesis does not play on resolution',async()=>{
    let resolve; const pending=new Promise(r=>resolve=r); const player={playBlob:vi.fn(async()=>{}),pause:vi.fn(),resume:vi.fn(async()=>{}),stop:vi.fn()};
    const q=new AudioQueue({player,synthesizer:()=>pending}); q.loadPlan({responseId:'r',segments:[seg('one')]}); const play=q.play(); q.pause(); resolve(new Blob()); await play; expect(player.playBlob).not.toHaveBeenCalled(); q.cancel();
  });
  it('FIXED cancel/new plan discards old synthesized audio',async()=>{
    let resolve; const pending=new Promise(r=>resolve=r); const old=new Blob(['old']); const player={playBlob:vi.fn(async()=>{}),pause:vi.fn(),resume:vi.fn(async()=>{}),stop:vi.fn()};
    const q=new AudioQueue({player,synthesizer:t=>t==='old'?pending:Promise.resolve(new Blob())}); q.loadPlan({responseId:'old',segments:[seg('old')]}); const play=q.play(); q.loadPlan({responseId:'new',segments:[seg('new')]}); await q.play(); resolve(old); await play; expect(player.playBlob).toHaveBeenCalledTimes(1); q.cancel();
  });
});
