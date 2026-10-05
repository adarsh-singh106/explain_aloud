// Isolated React tests: real App; mocked pipeline/audio/browser boundaries.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({build:vi.fn(),fixture:vi.fn(),queues:[]}));
vi.mock('@/src/services/ollama',()=>({checkOllamaServer:async()=>false,isModelAvailable:async()=>false}));
vi.mock('@/src/pipeline/pipeline',()=>({buildNarrationPlanFromIR:mocks.build,executePipelineFromHtml:mocks.fixture}));
vi.mock('@/src/audio/audioQueue',()=>({AudioQueue:class {
  constructor(options){this.options=options;this.cancel=vi.fn();this.loadPlan=vi.fn();this.play=vi.fn(async()=>{});this.pause=vi.fn();this.skip=vi.fn();mocks.queues.push(this);}
}}));
import App from '@/entrypoints/popup/App';
const makeIR=id=>({schemaVersion:'1.0',site:'chatgpt',responseId:id,blocks:[],facts:[]});
const result=id=>({ir:makeIR(id),facts:[],plan:{responseId:id,segments:[{id:'s',text:'Hello',sourceBlockIds:['b'],factIds:[],verified:true,provenance:'rule',pauseAfterMs:0}]},validationStats:{passedCount:1,fallbackCount:0}});
let listeners,root,host;
beforeEach(()=>{
  mocks.build.mockReset();mocks.fixture.mockReset();mocks.queues.length=0;listeners=[];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  vi.stubGlobal('browser',{runtime:{sendMessage:vi.fn(async()=>({ir:null})),onMessage:{addListener:fn=>listeners.push(fn),removeListener:fn=>{listeners=listeners.filter(x=>x!==fn);}}}});
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
const mount=async()=>act(async()=>root.render(React.createElement(App)));
const send=async(type,id)=>act(async()=>{listeners.forEach(fn=>fn({type,ir:makeIR(id)}));});
const click=async text=>act(async()=>{const btn=Array.from(host.querySelectorAll('button')).find(b=>b.textContent.includes(text));expect(btn).toBeTruthy();btn.click();});
describe('Real React application lifecycle',()=>{
  it('DEFECT extracted and rebroadcast events start duplicate pipelines',async()=>{
    mocks.build.mockReturnValue(new Promise(()=>{}));await mount();await send('EXPLAIN_ALOUD_EXTRACTED','A');await send('EXPLAIN_ALOUD_SESSION_UPDATED','A');expect(mocks.build).toHaveBeenCalledTimes(2);
  });
  it('DEFECT listener captures Natural mode after selecting Literal',async()=>{
    mocks.build.mockReturnValue(new Promise(()=>{}));await mount();await click('Literal Mode');await send('EXPLAIN_ALOUD_SESSION_UPDATED','A');expect(mocks.build.mock.calls[0][1].mode).toBe('natural');
    expect(Array.from(host.querySelectorAll('button')).find(b=>b.textContent.includes('Literal Mode')).getAttribute('aria-pressed')).toBe('true');
  });
  it('DEFECT older request overwrites and plays after newer request',async()=>{
    let finishOld;const old=new Promise(r=>finishOld=r);mocks.build.mockImplementation(ir=>ir.responseId==='old'?old:Promise.resolve(result('new')));
    await mount();await send('EXPLAIN_ALOUD_SESSION_UPDATED','old');await send('EXPLAIN_ALOUD_SESSION_UPDATED','new');await act(async()=>finishOld(result('old')));
    expect(mocks.queues[0].loadPlan.mock.calls.at(-1)[0].responseId).toBe('old');expect(mocks.queues[0].play).toHaveBeenCalledTimes(2);
  });
  it('DEFECT cancel while replacing a plan does not prevent delayed autoplay',async()=>{
    let finish; mocks.build.mockResolvedValueOnce(result('first')).mockImplementationOnce(()=>new Promise(r=>finish=r));
    await mount();await send('EXPLAIN_ALOUD_SESSION_UPDATED','first');await send('EXPLAIN_ALOUD_SESSION_UPDATED','second');await click('Cancel');await act(async()=>finish(result('second')));
    expect(mocks.queues[0].loadPlan.mock.calls.at(-1)[0].responseId).toBe('second');expect(mocks.queues[0].play).toHaveBeenCalledTimes(2);
  });
  it('DEFECT first pending request offers no Cancel control',async()=>{
    mocks.build.mockReturnValue(new Promise(()=>{}));await mount();await send('EXPLAIN_ALOUD_SESSION_UPDATED','first');expect(host.textContent).toContain('Analyzing');expect(host.textContent).not.toContain('Cancel');
  });
  it('DEFECT empty plan displays Segment 1 of 0',async()=>{
    mocks.build.mockResolvedValue({...result('empty'),plan:{responseId:'empty',segments:[]}});await mount();await send('EXPLAIN_ALOUD_SESSION_UPDATED','empty');expect(host.textContent).toContain('Segment 1 of 0');
  });
  it('DEFECT pipeline resolves after unmount and calls playback',async()=>{
    let finish;mocks.build.mockImplementation(()=>new Promise(r=>finish=r));await mount();await send('EXPLAIN_ALOUD_SESSION_UPDATED','first');await act(async()=>root.unmount());await act(async()=>finish(result('first')));
    expect(mocks.queues[0].play).toHaveBeenCalledOnce();
    // Install an empty root for shared cleanup.
    root=createRoot(host);
  });
});
