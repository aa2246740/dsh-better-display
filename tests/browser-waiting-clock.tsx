import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WaitingStatus } from '../src/client/WaitingStatus.js';
import { waitingAnchor } from '../src/client/waiting-clock.js';
function Fixture() {
 const [inputs,setInputs]=useState([{key:'u1',kind:'user',data:{time:Date.now()-300000}}]);
 const [renders,setRenders]=useState(0);
 const anchor=waitingAnchor(inputs.map(x=>x.key),key=>inputs.find(x=>x.key===key),[],true);
 return <main style={{padding:30}}><h1>等待计时回归：真实组件、模拟输入</h1>
 <button onClick={()=>setInputs(x=>[...x,{key:`s${x.length}`,kind:'steering',data:{time:Date.now()}}])}>追加 steering</button>
 <button onClick={()=>setRenders(x=>x+1)}>普通输出更新</button><span>更新次数 {renders}</span>
 <WaitingStatus anchor={anchor} label="深度求索中..."/></main>;
}
createRoot(document.getElementById('app')!).render(<Fixture/>);
