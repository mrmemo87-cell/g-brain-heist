import test from 'node:test';
import assert from 'node:assert/strict';
import { a4CaptureFrame } from '../src/lib/paperScan/capture';
test('portrait and landscape camera streams save exactly the displayed portrait A4 crop', () => {
  for (const [width,height] of [[1920,1080],[1920,2560],[4032,3024]]) {
    const frame=a4CaptureFrame(width,height);
    assert.ok(Math.abs(frame.width/frame.height-210/297)<1e-10);
    assert.equal(frame.x*2+frame.width,width);assert.equal(frame.y*2+frame.height,height);
    assert.ok(Math.max(frame.outputWidth,frame.outputHeight)<=2600);
    assert.ok(frame.outputHeight>frame.outputWidth);
  }
  assert.throws(()=>a4CaptureFrame(0,0));
});
