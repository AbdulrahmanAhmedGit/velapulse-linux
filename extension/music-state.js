// Shared, toolkit-independent rules. Business state remains in the Rust service.
export function players(activities){return activities.filter(a=>a.id.startsWith('media:'));}
export function activePlayer(activities,preferred=''){const p=players(activities);return p.find(a=>a.id===preferred)??p.find(a=>a.status==='active')??p[0];}
export function lyricIndex(lines,seconds){let left=0,right=lines.length;while(left<right){const mid=(left+right)>>1;if(lines[mid].seconds<=seconds)left=mid+1;else right=mid;}return left-1;}
export function musicColor(a){const color=a?.music?.color;if(!/^#[0-9a-f]{6}$/i.test(color??''))return '#b5a4f5';const c=color.slice(1).match(/../g).map(x=>parseInt(x,16));return '#'+c.map(v=>Math.round(v*.45+255*.55).toString(16).padStart(2,'0')).join('');}
export function pillWidth(a,maximum){const text=[a?.title??'VelaPulse',a?.description??'Ready when you are'].join(' · ');return Math.min(maximum,Math.max(230,100+Math.min(text.length,70)*6+(a?.controls?.length??0)*28));}
