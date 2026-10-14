import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {parseRenderOptions} from '../scripts/native-route.mjs';
const root=path.resolve('caller-not-project');
test('render output location follows caller cwd and backend flags can be reordered',()=>{
  const expected={backend:'libreoffice',outputDir:path.resolve(root,'short/render-1')};
  assert.deepEqual(parseRenderOptions(['--backend','libreoffice','--output-dir','short/render-1'],root),expected);
  assert.deepEqual(parseRenderOptions(['--output-dir','short/render-1','--backend','libreoffice'],root),expected);
  assert.deepEqual(parseRenderOptions([],root),{backend:'auto'});
});
test('render does not accept missing repeated or unknown options',()=>{
  for(const args of [['--output-dir'],['--output-dir',''],['--backend','--output-dir'],['--backend','svg'],['--unknown','x'],['--backend','office','--backend','libreoffice'],['--output-dir','x','--output-dir','y']])assert.throws(()=>parseRenderOptions(args,root));
});
