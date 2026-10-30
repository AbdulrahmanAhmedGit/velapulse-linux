// Preserve widgets, keyboard targets and horizontal scroll position across updates.
export function createContextCard(ui,contextTree,activity,onAction){
 function build(node){const widget=ui.create(node,onAction);return {node,widget,children:[]};}
 function reconcile(instance,node){ui.update(instance.widget,node);const old=new Map(instance.children.map(c=>[c.node.key,c]));const children=[];for(const child of node.children??[]){let c=old.get(child.key);if(c&&c.node.type!==child.type){ui.remove(instance.widget,c.widget);c=null;}old.delete(child.key);if(!c)c=build(child);reconcile(c,child);children.push(c);}for(const c of old.values())ui.remove(instance.widget,c.widget);ui.children(instance.widget,children.map(c=>c.widget));instance.children=children;instance.node=node;}
 const tree=contextTree(activity),instance=build(tree);reconcile(instance,tree);return {widget:instance.widget,update:a=>reconcile(instance,contextTree(a))};
}
