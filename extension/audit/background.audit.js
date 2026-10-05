import { afterEach, expect, it, vi } from 'vitest';
afterEach(()=>vi.unstubAllGlobals());
it('DEFECT background accepts malformed IR, shares session across tabs, acknowledges failed opening',async()=>{
  let listener; const open=vi.fn().mockRejectedValue(new Error('open failed'));
  vi.stubGlobal('chrome',{sidePanel:{open,setPanelBehavior:vi.fn(async()=>{})}});
  vi.stubGlobal('browser',{runtime:{onMessage:{addListener:fn=>listener=fn},sendMessage:vi.fn(async()=>{})}});
  vi.stubGlobal('defineBackground',fn=>fn());
  await import('@/entrypoints/background');
  const ack=vi.fn();listener({type:'EXPLAIN_ALOUD_EXTRACTED',ir:{responseId:'malformed'}},{tab:{id:1},url:'https://chatgpt.com/'},ack);
  await Promise.resolve();expect(ack).toHaveBeenCalledWith({ok:true,responseId:'malformed'});
  const retrieve=vi.fn();listener({type:'GET_CURRENT_SESSION'},{tab:{id:2}},retrieve);expect(retrieve).toHaveBeenCalledWith({ir:{responseId:'malformed'}});
});
