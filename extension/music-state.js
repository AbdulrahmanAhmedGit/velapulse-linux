// Shared, toolkit-independent rules. Business state remains in the Rust service.
export function players(activities){return activities.filter(a=>a.id.startsWith('media:'));}
export function activePlayer(activities,preferred=''){const p=players(activities);return p.find(a=>a.id===preferred)??p.find(a=>a.status==='active')??p[0];}
export function lyricIndex(lines,seconds){let left=0,right=lines.length;while(left<right){const mid=(left+right)>>1;if(lines[mid].seconds<=seconds)left=mid+1;else right=mid;}return left-1;}
export function musicColor(a){const color=a?.music?.color;if(!/^#[0-9a-f]{6}$/i.test(color??''))return '#b5a4f5';const c=color.slice(1).match(/../g).map(x=>parseInt(x,16));return '#'+c.map(v=>Math.round(v*.45+255*.55).toString(16).padStart(2,'0')).join('');}
