import { expect, it } from "vitest";
import { readClusterBridgeSpot, mergeClusterBridgeSpot } from "./clusterBridge";
const now=Date.UTC(2026,8,7);
const payload={id:"one",dx:"K1TEST",spotter:"N0TEST",frequency:14074.123,mode:"FT8",band:"20m",time:new Date(now).toISOString(),comment:"test"};
it("validates a transport report before allowing it to take over the feed",()=>{
  expect(readClusterBridgeSpot(payload,now)).toMatchObject({id:"one",frequency:14074.123,time:new Date(now)});
  for(const patch of [{id:""},{dx:null},{spotter:{}},{frequency:NaN},{frequency:-1},{time:"bad"},{time:new Date(now+60_001).toISOString()},{mode:{}},{dxGrid:[]}]) {
    expect(readClusterBridgeSpot({...payload,...patch},now)).toBeNull();
  }
  expect(readClusterBridgeSpot(null,now)).toBeNull();
});
it("deduplicates shared broadcasts, preserves newest-first order, and bounds retention",()=>{
  const rows=Array.from({length:20},(_,i)=>readClusterBridgeSpot({...payload,id:String(i),time:new Date(now-i*1000).toISOString()},now)!);
  const merged=mergeClusterBridgeSpot(rows,rows[0],30,10,now);
  expect(merged).toHaveLength(10);expect(merged.map(s=>s.id)).toEqual(Array.from({length:10},(_,i)=>String(i)));
  expect(mergeClusterBridgeSpot(rows,rows[0],5,50,now+301_000)).toEqual([]);
  const legacy = { ...rows[1], time: rows[1].time.toISOString() as unknown as Date };
  expect(mergeClusterBridgeSpot([legacy],rows[0],30,50,now).map(s=>s.id)).toEqual(["0","1"]);
});

it("retains accepted next-minute timestamps while rejecting larger clock skew", () => {
  const next = readClusterBridgeSpot({ ...payload, time: new Date(now + 60_000).toISOString() }, now);
  expect(next).not.toBeNull();
  expect(mergeClusterBridgeSpot([], next!, 30, 50, now)).toEqual([next]);
  expect(mergeClusterBridgeSpot([next!], readClusterBridgeSpot({ ...payload, id: "current" }, now)!, 30, 50, now + 30_000).map(row => row.id)).toEqual(["one", "current"]);
  expect(readClusterBridgeSpot({ ...payload, time: new Date(now + 60_001).toISOString() }, now)).toBeNull();
});
