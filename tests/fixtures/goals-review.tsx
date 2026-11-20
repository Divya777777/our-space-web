// Local-only visual/interaction fixture: /tests/fixtures/goals-review.html on the Vite dev server.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/outfit';
import '../../src/styles.css';
import { GoalMonthReview } from '../../src/components/GoalMonthReview';
import { localDay } from '../../src/lib/goals';
import type { GoalsMonth, MonthRow } from '../../src/lib/goals';

const values = new Map<string, number>();
const control = { fail: false, delay: 0, writes: 0 };
Object.assign(window, { reviewTest: control });
function fixture(month: string, today: string): GoalsMonth {
  const [y,m] = month.split('-').map(Number);
  const count = new Date(y,m,0).getDate();
  const habits = [
    { goalId: 'water', name: 'A little more water', kind: 'water', target: 8, unit: 'glasses', track: 'count', inc: 1 },
    { goalId: 'read', name: 'Make time for a book', kind: 'read', target: 1, unit: '', track: 'check', inc: 1 },
    { goalId: 'steps', name: 'A walk, just for you', kind: 'steps', target: 10000, unit: 'steps', track: 'auto', inc: 1000 },
  ];
  return { month, today, detailVersion: 2, partner: {id:'2', name:'Leo'}, members:[{id:'1',name:'Divya'},{id:'2',name:'Leo'}], rates:[], days:Array.from({length:count},(_,i)=> {
    const d=i+1, date=`${month}-${String(d).padStart(2,'0')}`;
    if(date>today)return {d,future:true};
    const rows = ['1','2'].flatMap(userId=>habits.map((h,index)=>{
      const key=`${date}:${userId}:${h.goalId}`;
      const value=values.has(key)? values.get(key)! : date===today ? h.goalId==='water'?4:h.goalId==='steps'?6200:0 : d%7===0?null:d%5===index?Math.floor(h.target/2):h.target;
      const ok=value!==null && value>=h.target;
      return {...h,userId,w:userId==='1'?'me':'them',value,ok,progressPct:Math.min(100,Math.round((value||0)/h.target*100)),status:ok?'complete':value===null?'unlogged':value>0?'partial':'incomplete'} as MonthRow;
    }));return {d,rows};
  })};
}
function Preview(){const [closed,setClosed]=React.useState(false);return <>{closed?<button onClick={()=>setClosed(false)}>Open review</button>:<GoalMonthReview userId="1" load={async(m,t)=>{if(control.fail)throw Error('Fixture load failed');return fixture(m,t);}} log={async(id,day,value)=>{control.writes++;await new Promise(r=>setTimeout(r,control.delay));if(control.fail)throw Error('Couldn’t save. Try again.');values.set(`${day}:1:${id}`,value);}} onChanged={()=>{}} onClose={()=>setClosed(true)}/>}<span className="sr-only">{localDay()}</span></>;}
createRoot(document.getElementById('root')!).render(<Preview/>);
