import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { executePipelineFromHtml } from '@/src/pipeline/pipeline';
import * as ollama from '@/src/services/ollama';
beforeEach(()=>vi.spyOn(ollama,'generateWithGemma').mockRejectedValue(new Error('offline')));
afterEach(()=>vi.restoreAllMocks());
const run=async(html,mode='literal')=>(await executePipelineFromHtml(`<article>${html}</article>`,{mode})).plan.segments.map(s=>s.text).join('\n');
const tab=(headers,rows)=>`<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const pre=(code='if ok:\n  action()\ncleanup()')=>`<pre><code class="language-python">${code}</code></pre>`;

describe('Mutation controls - final text',()=>{
  for(const block of [pre(),tab(['Name','Value'],[['Alpha','1'],['Beta','2']])]){
    for(const tag of ['div','section','article']) it(`warnings both sides, ${tag}, ${block.slice(0,6)}`,async()=>{
      const text=await run(`<${tag}><span>Warning before.</span>${block}<span>Warning after.</span></${tag}>`);
      expect(text).toContain('Warning before.');expect(text).toContain('Warning after.');expect(text.indexOf('Warning before.')).toBeLessThan(text.indexOf('Warning after.'));
      expect(text.match(/Warning before/g)).toHaveLength(1);expect(text.match(/Warning after/g)).toHaveLength(1);
    });
  }
  it('multiple code blocks with warnings keep order and uniqueness',async()=>{
    const text=await run(`<div>Before.${pre('first()')}<section>Between.${pre('second()')}</section>After.</div>`);
    for(const s of ['Before.','first()','Between.','second()','After.'])expect(text).toContain(s);
    expect(text.match(/first\(\)/g)).toHaveLength(1);expect(text.match(/second\(\)/g)).toHaveLength(1);
    expect(text.indexOf('first()')).toBeLessThan(text.indexOf('second()'));
  });
  for(const [html,expected] of [['file<code>_name</code>.txt','file_name.txt'],['<code>file</code>_name.txt','file_name.txt'],['file_name<code>.txt</code>','file_name.txt'],['get<code>User</code>Id','getUserId']]){
    for(const tag of ['p','li'])it(`inline adjacency without pre ${tag} ${html}`,async()=>{
      const content=tag==='li'?`<ul><li>Use ${html} now.</li></ul>`:`<p>Use ${html} now.</p>`;
      expect(await run(content)).toContain(expected);
    });
  }
  for(const rows of [[['Alpha'],['Beta'],['Gamma']],[['10'],['20'],['30']]])for(const mode of ['natural','literal'])it(`one column ${mode} ${rows[0][0]}`,async()=>{
    const text=await run(tab(['Value'],rows),mode);for(const [value] of rows)expect(text).toContain(value);
  });
  for(const [a,b] of [['8 b','2 B'],['8 kb','2 kB'],['8 QuX','2 qux']])it(`incompatible ${a} / ${b}`,async()=>{
    const text=await run(tab(['Link','Size'],[['Alpha',a],['Beta',b]]),'natural');expect(text).toContain(a);expect(text).toContain(b);expect(text).not.toMatch(/highest|lowest|tied/);
  });
  for(const n of [2,3])it(`${n}-way partial ties across metrics preserve entities`,async()=>{
    const rows=Array.from({length:n},(_,i)=>[`Model${String.fromCharCode(65+i)}`,'10',String(i+1)]);rows.push(['ModelZ','5','1']);
    const text=await run(tab(['Model','Score','Latency'],rows),'natural');for(const [name] of rows)expect(text).toContain(name);
  });
  for(const indent of ['  ','   ','\t','\t\t'])it(`uniform indentation ${JSON.stringify(indent)}`,async()=>{
    const text=await run(pre(`if ok:\n${indent}action()`));expect(text).toContain(indent.includes('\t')?`indent ${indent.length} tab`:`indent ${indent.length} spaces`);
  });
});

describe('Reproduced Package 1.1 failures - assertions describe current incorrect output',()=>{
  for(const [html,expected] of [['file<code>_name</code>.txt','file_name.txt'],['<code>file</code>_name.txt','file_name.txt'],['file_name<code>.txt</code>','file_name.txt'],['get<code>User</code>Id','getUserId']])it(`inline adjacency breaks when same list item includes pre: ${html}`,async()=>{
    const text=await run(`<ul><li>Use ${html} before running.${pre()}Keep ${html} afterward.</li></ul>`);console.log('mixed list:',text);expect(text).not.toContain(expected);
  });
  it('empty list item desynchronizes arrays, duplicates code and drops trailing warning',async()=>{
    const text=await run(`<ul><li></li><li>Before.${pre('if ready:\n   alpha()')}After.</li><li>Never deploy this.</li></ul>`);console.log('empty li:',text);expect(text).not.toContain('Never deploy');expect(text.match(/alpha\(\)/g)).toHaveLength(2);
  });
  it('visual phrase in code string causes list fallback to destroy code text and formatting',async()=>{
    const text=await run(`<ol start="5"><li>Run:${pre('if ok:\n   print("as shown above")\ncleanup()')}Then stop.</li></ol>`);console.log('fallback list:',text);expect(text).not.toContain('as shown above');expect(text).not.toContain('Line 2');expect(text).toContain('Item 1:');
  });
  for(const n of [2,3])it(`all-${n}-way ties across multiple metrics omit all entities`,async()=>{
    const names=['Alpha','Beta','Gamma'].slice(0,n);const text=await run(tab(['Model','Score','Latency'],names.map(name=>[name,'10','2 s'])),'natural');console.log('all ties:',text);for(const name of names)expect(text).not.toContain(name);
  });
  it('duplicate labels erase cross-metric row relationships',async()=>{
    const a=await run(tab(['Model','Score','Latency'],[['Shared','10','1 s'],['Shared','5','9 s']]),'natural');
    const b=await run(tab(['Model','Score','Latency'],[['Shared','10','9 s'],['Shared','5','1 s']]),'natural');console.log('duplicate labels:',a);expect(a).toBe(b);
  });
  it('Kib is interpreted as KiB and produces reversed ranking',async()=>{
    const text=await run(tab(['Link','Size'],[['Alpha','8 Kib'],['Beta','2 KiB']]),'natural');console.log('Kib:',text);expect(text).toContain('Alpha is highest at 8 Kib');
  });
  it('mixed tabs and spaces falsely reported as all spaces',async()=>{
    const text=await run(pre('if ok:\n \taction()\n\t other()'));console.log('mixed indent:',text);expect(text).toContain('Line 2, indent 5 spaces');expect(text).toContain('Line 3, indent 5 spaces');expect(text).not.toContain('tab');
  });
});
