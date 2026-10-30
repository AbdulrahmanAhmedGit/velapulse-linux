import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';

// Discover native rows after every page has been built. Results lead to the
// actual control, so there is only one setting widget and one persistence path.
export function createSettingsSearch({window,search,results,stack,navButtons,previewRows,PROVIDERS,sizes,cards,getActivities}) {
    const entries=[];
    function visit(widget,page) {
        if(widget instanceof Adw.PreferencesRow)entries.push({widget,page,title:widget.title,subtitle:widget.subtitle??''});
        for(let child=widget.get_first_child();child;child=child.get_next_sibling())visit(child,page);
    }
    const pages=stack.get_pages();
    for(let i=0;i<pages.get_n_items();i++){const page=pages.get_item(i);visit(page.child,page.name);}
    function navigate(entry){
        search.text='';stack.visible_child_name=entry.page;
        const nav=navButtons.find(b=>b._settingsPage===entry.page);if(nav)nav.active=true;
        // Native focus scrolls the target row into view and supports its keyboard action.
        entry.widget.grab_focus();
    }
    function applySearch(){
        const q=search.text.trim().toLocaleLowerCase();
        while(results.get_first_child())results.remove(results.get_first_child());
        if(q){
            const matches=entries.filter(e=>`${e.title} ${e.subtitle}`.toLocaleLowerCase().includes(q)).slice(0,4);
            for(const entry of matches){const row=new Adw.ActionRow({title:entry.title,subtitle:entry.page==='volume'?'Audio':entry.page[0].toUpperCase()+entry.page.slice(1),activatable:true});row.add_suffix(new Gtk.Image({icon_name:'go-next-symbolic'}));row.connect('activated',()=>navigate(entry));results.append(row);}
            if(!matches.length)results.append(new Adw.ActionRow({title:'No matching settings',subtitle:'Try “location”, “motion”, “lyrics” or “display”.'}));
        }
        results.visible=Boolean(q);
        for(const [id,{row}]of previewRows){const match=!q||id.includes(q)||PROVIDERS.find(x=>x[0]===id)[1].toLowerCase().includes(q);row.visible=match&&(id!=='stopwatch'||getActivities().some(a=>a.id==='stopwatch')||Boolean(q));}
        sizes.visible=!q||'pill size'.includes(q);cards.visible=!q||'card size'.includes(q);
    }
    const changed=search.connect('search-changed',applySearch);
    const activate=search.connect('activate',()=>{const q=search.text.trim().toLocaleLowerCase();const entry=entries.find(e=>`${e.title} ${e.subtitle}`.toLocaleLowerCase().includes(q));if(q&&entry)navigate(entry);});
    const keys=new Gtk.EventControllerKey();keys.connect('key-pressed',(_,key,_code,mods)=>{
        if((mods&Gdk.ModifierType.CONTROL_MASK)&&(key===Gdk.KEY_f||key===Gdk.KEY_F)){search.grab_focus();return true;}
        if(key===Gdk.KEY_Escape&&search.text){search.text='';return true;}
        return false;
    });window.add_controller(keys);
    return {applySearch,dispose(){search.disconnect(changed);search.disconnect(activate);window.remove_controller(keys);}};
}
