// Nested sections are patches so quick changes cannot reset another pending field.
export function mergeSettings(...layers){return layers.reduce((base,patch)=>{const next={...base,...patch};for(const key of ['weather','developer','priorities'])if(patch[key])next[key]={...base[key],...patch[key]};return next;},{});}
