import test from 'node:test';
import assert from 'node:assert/strict';
import {authoringAdvisories} from '../scripts/lib/upstream-notices.mjs';
const options={python:'chosen-python',official:'/pinned-upstream',project:'/project',reportPath:'/report.json'};
test('authoring advisory preserves upstream issues and distinguishes issue count from page count',()=>{
  const issues=[{file:'01.svg',message:'Noncanonical compact authoring: inherited styles; compact_svg_styles.py; or leave explicit form'},
    {file:'01.svg',message:'Noncanonical compact authoring: page-space metadata; compact_svg_coordinates.py --keep-native-frames'},
    {file:'02.svg',message:'Other unrelated advisory'}];
  const report={categories:{introduced:{issues}}},before=JSON.stringify(report),out=authoringAdvisories(report,options);
  assert.equal(out.severity,'advisory');assert.equal(out.issueCount,2);assert.equal(out.affectedFileCount,1);
  assert.deepEqual(out.issues,issues.slice(0,2));assert.equal(JSON.stringify(report),before);
  assert.equal(out.optionalNormalization.commands.length,2);
  assert.ok(out.optionalNormalization.commands.every(c=>c.file==='chosen-python'));
  assert.ok(out.optionalNormalization.commands.find(c=>c.args[0].endsWith('coordinates.py')).args.includes('--keep-native-frames'));
  assert.ok(!out.optionalNormalization.commands.find(c=>c.args[0].endsWith('styles.py')).args.includes('--keep-native-frames'));
});
test('structured authoring that upstream keeps explicit gets no invented rewrite command',()=>{
  const out=authoringAdvisories({categories:{introduced:{issues:[{file:'01.svg',message:'Noncanonical compact authoring: advisory; structured rosters keep their explicit form'}]}}},options);
  assert.equal(out.issueCount,1);assert.equal(out.optionalNormalization,null);
});
test('no advisory stays an empty factual summary, not a design verdict',()=>{
  const out=authoringAdvisories({},options);assert.equal(out.issueCount,0);assert.equal(out.optionalNormalization,null);assert.equal(out.status,undefined);
});
